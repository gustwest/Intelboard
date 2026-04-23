"""Source detection + file parsing + dataset ingestion.

Detection strategy:
  1. Build a column-fingerprint from the uploaded file.
  2. For each Source, check detect_rules:
     - filename_patterns (fnmatch-style) boost score
     - required_columns must be a subset of the file's columns (case-insensitive)
     - Otherwise score by overlap with the current SourceVersion's mapped columns
  3. Return best match, or drift info if columns partially match, or no_match.
"""
from __future__ import annotations

import csv
import fnmatch
import hashlib
import io
import os
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy.orm import Session

import models


# ----------------- File parsing -----------------

def _sniff_and_read_csv(data: bytes) -> Optional[pd.DataFrame]:
    """Try several encodings and parsing strategies for CSV files."""
    # UTF-16 (LinkedIn Campaign Manager often emits this with BOM + tabs)
    for encoding in ("utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "utf-8", "latin-1"):
        for sep in ("\t", ",", ";"):
            try:
                df = pd.read_csv(io.BytesIO(data), encoding=encoding, sep=sep, engine="python", on_bad_lines="skip")
                if df.shape[1] >= 2:
                    return df
            except Exception:
                continue
    return None


def _try_excel(data: bytes, filename: str) -> Optional[pd.DataFrame]:
    """Read xls/xlsx. Some LinkedIn exports have a metadata preamble — try a few skiprows."""
    engine = "xlrd" if filename.lower().endswith(".xls") else "openpyxl"
    for skip in (0, 1, 2, 3, 4, 5, 6, 7):
        try:
            df = pd.read_excel(io.BytesIO(data), engine=engine, skiprows=skip)
            # Heuristic: a real header row has mostly non-empty, unique column names
            cols = [str(c).strip() for c in df.columns]
            non_unnamed = sum(1 for c in cols if c and not c.startswith("Unnamed"))
            if non_unnamed >= max(2, len(cols) // 2):
                return df
        except Exception:
            continue
    return None


def parse_file(data: bytes, filename: str) -> Optional[pd.DataFrame]:
    name = filename.lower()
    if name.endswith((".xls", ".xlsx")):
        df = _try_excel(data, filename)
        if df is not None:
            return df
        # fall through to CSV in case it was misnamed
    if name.endswith(".csv") or name.endswith(".tsv") or name.endswith(".txt"):
        return _sniff_and_read_csv(data)
    # Last resort: try both
    df = _try_excel(data, filename)
    if df is not None:
        return df
    return _sniff_and_read_csv(data)


# ----------------- Source detection -----------------

def _norm(s: str) -> str:
    return str(s or "").strip().lower()


def _columns_of(df: pd.DataFrame) -> List[str]:
    return [str(c).strip() for c in df.columns]


def detect_source(
    db: Session,
    df: pd.DataFrame,
    filename: str,
) -> Tuple[str, Optional[models.Source], Optional[models.SourceVersion], Dict[str, Any]]:
    """Returns (status, source, version, detail).

    status ∈ {"matched", "drift", "no_match"}.
    """
    file_cols = _columns_of(df)
    file_cols_norm = {_norm(c): c for c in file_cols}

    best: Optional[Tuple[float, models.Source, models.SourceVersion, Dict[str, Any]]] = None

    sources = db.query(models.Source).all()
    for source in sources:
        rules = source.detect_rules_json or {}

        # 1) filename pattern boost
        fn_score = 0.0
        for pat in rules.get("filename_patterns", []):
            if fnmatch.fnmatch(filename.lower(), pat.lower()):
                fn_score = 1.0
                break

        # 2) score against current version's mapped columns
        current_version = next((v for v in source.versions if v.is_current), None)
        if current_version is None:
            continue

        mapped_cols_norm = {_norm(m.column_name) for m in current_version.mappings}
        if not mapped_cols_norm:
            continue

        matched = mapped_cols_norm & set(file_cols_norm.keys())
        overlap = len(matched) / max(1, len(mapped_cols_norm))

        # required_columns from detect_rules is a *boost* — a file that includes
        # them gets +0.3 but not meeting them is no longer disqualifying,
        # since a version bump can rename/drop those very columns.
        required = [_norm(c) for c in rules.get("required_columns", [])]
        req_met = bool(required) and all(c in file_cols_norm for c in required)

        score = overlap + 0.25 * fn_score + (0.3 if req_met else 0)

        detail = {
            "overlap": overlap,
            "fn_score": fn_score,
            "required_met": req_met,
            "matched_columns": [file_cols_norm[c] for c in matched],
            "missing_columns": [m.column_name for m in current_version.mappings if _norm(m.column_name) not in file_cols_norm],
            "extra_columns": [c for c in file_cols if _norm(c) not in mapped_cols_norm],
        }

        if best is None or score > best[0]:
            best = (score, source, current_version, detail)

    if best is None:
        return "no_match", None, None, {"file_columns": file_cols}

    score, source, version, detail = best
    # Thresholds: >= 0.9 match, >= 0.5 drift, else no_match
    if detail["overlap"] >= 0.9:
        return "matched", source, version, detail
    if detail["overlap"] >= 0.5:
        return "drift", source, version, detail
    return "no_match", None, None, {"file_columns": file_cols, "best_candidate": source.key, "overlap": detail["overlap"]}


# ----------------- Ingestion -----------------

def _cast(value: Any, data_type: str) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if data_type == "int":
        try:
            return int(float(str(value).replace(",", "").replace(" ", "")))
        except (ValueError, TypeError):
            return None
    if data_type == "float":
        try:
            return float(str(value).replace(",", ".").replace(" ", ""))
        except (ValueError, TypeError):
            return None
    if data_type == "bool":
        s = _norm(value)
        if s in ("true", "1", "yes", "y", "ja"): return True
        if s in ("false", "0", "no", "n", "nej"): return False
        return None
    if data_type == "date":
        try:
            return pd.to_datetime(value).isoformat()
        except Exception:
            return str(value)
    return str(value).strip()


def ingest_dataset(
    db: Session,
    customer: models.Customer,
    source: models.Source,
    version: models.SourceVersion,
    df: pd.DataFrame,
    filename: str,
    raw_bytes: bytes,
) -> models.Dataset:
    """Normalize df → DatasetRow values_json keyed by source_field_id."""
    # Build column_name (lower) -> (source_field_id, data_type)
    col_to_field: Dict[str, Tuple[str, str]] = {}
    for m in version.mappings:
        field = m.source_field
        col_to_field[_norm(m.column_name)] = (field.id, field.data_type)

    sha = hashlib.sha256(raw_bytes).hexdigest()
    dataset = models.Dataset(
        customer_id=customer.id,
        source_id=source.id,
        source_version_id=version.id,
        original_filename=filename,
        sha256=sha,
        row_count=0,
    )
    db.add(dataset)
    db.flush()

    rows_to_add: List[models.DatasetRow] = []
    for idx, row in df.iterrows():
        values: Dict[str, Any] = {}
        for col in df.columns:
            col_norm = _norm(col)
            if col_norm in col_to_field:
                field_id, dtype = col_to_field[col_norm]
                values[field_id] = _cast(row[col], dtype)
        if values:
            rows_to_add.append(models.DatasetRow(
                dataset_id=dataset.id,
                row_index=int(idx),
                values_json=values,
            ))

    db.bulk_save_objects(rows_to_add)
    dataset.row_count = len(rows_to_add)
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset
