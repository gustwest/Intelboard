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
    """Try several encodings and parsing strategies for CSV files.
    LinkedIn Campaign Manager CSVs are UTF-16 with tab separators and
    7 metadata preamble rows before the real header."""
    for encoding in ("utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "utf-8", "latin-1"):
        for sep in ("\t", ",", ";"):
            for skip in (0, 1, 2, 3, 4, 5, 6, 7):
                try:
                    df = pd.read_csv(io.BytesIO(data), encoding=encoding, sep=sep,
                                     skiprows=skip, engine="python", on_bad_lines="skip")
                    if df.shape[1] >= 2:
                        # Verify we got a real header (not metadata rows)
                        cols = [str(c).strip() for c in df.columns]
                        non_unnamed = sum(1 for c in cols if c and not c.startswith("Unnamed"))
                        if non_unnamed >= max(2, len(cols) // 2):
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


# ----------------- Auto-creation -----------------

def _infer_data_type(series: pd.Series, sample_size: int = 100) -> str:
    """Infer a SourceField data_type by sampling non-null values."""
    vals = series.dropna().head(sample_size)
    if vals.empty:
        return "str"

    # Check bool first (small set of known values)
    bool_vals = {"true", "false", "yes", "no", "y", "n", "ja", "nej", "1", "0"}
    str_vals = {_norm(v) for v in vals.astype(str)}
    if str_vals and str_vals.issubset(bool_vals):
        return "bool"

    # Try int
    try:
        converted = vals.astype(str).str.replace(",", "").str.replace(" ", "").str.strip()
        converted.astype(float).astype(int)
        # Verify they're actually integers (no decimals)
        floats = converted.astype(float)
        if (floats == floats.astype(int).astype(float)).all():
            return "int"
    except (ValueError, TypeError):
        pass

    # Try float
    try:
        vals.astype(str).str.replace(",", ".").str.replace(" ", "").astype(float)
        return "float"
    except (ValueError, TypeError):
        pass

    # Try date
    try:
        pd.to_datetime(vals, infer_datetime_format=True)
        return "date"
    except Exception:
        pass

    return "str"


def _source_name_from_filename(filename: str) -> str:
    """'campaign_performance_2024.csv' → 'Campaign Performance 2024'."""
    import re as _re
    name = os.path.splitext(filename)[0]
    name = _re.sub(r"[_\-]+", " ", name)
    return name.strip().title()


def _infer_platform_category(filename: str) -> Tuple[str, str]:
    """Infer platform and category from filename patterns."""
    fn = filename.lower()

    # LinkedIn Campaign Manager patterns
    if "account_" in fn and any(kw in fn for kw in (
        "campaign_performance", "campaign_placement", "creative_performance",
        "creative_placement", "creative_conversion", "conversion_performance",
        "lan_creative", "conversation_ads",
    )):
        return "LinkedIn Campaign Manager", "Campaign"
    if "demographics_report" in fn:
        return "LinkedIn Campaign Manager", "Demographics"
    if "companies-export" in fn or "companies_export" in fn:
        return "LinkedIn Campaign Manager", "Companies"

    # LinkedIn Page Analytics
    if any(kw in fn for kw in ("_content_", "_followers_", "_visitors_")):
        return "LinkedIn Page Analytics", fn.split("_")[-1].split(".")[0].title() if "_" in fn else "Content"
    if "competitor_analytics" in fn:
        return "LinkedIn Page Analytics", "Competitors"

    # LinkedIn Recruiter
    if any(kw in fn for kw in ("recruiter_usage", "funnel_report", "inmail_report", "pipeline_report", "custom_report_user")):
        return "LinkedIn Recruiter", "Recruiter"

    # LinkedIn Talent Insights
    if "talent_insights" in fn or "talent insights" in fn:
        return "LinkedIn Talent Insights", "Talent"

    # LinkedIn Personal Profile
    if any(kw in fn for kw in ("aggregateanalytics", "singlepostanalytics", "connections", "reactions", "comments", "messages", "profile")):
        return "LinkedIn Personal Profile", "Personal"

    return "", ""


def auto_create_source(
    db: Session,
    df: pd.DataFrame,
    filename: str,
) -> Tuple[models.Source, models.SourceVersion]:
    """Create a Source + SourceFields + SourceVersion v1 from a DataFrame's columns."""
    from helpers import slugify

    source_name = _source_name_from_filename(filename)
    source_key = slugify(source_name)
    platform, category = _infer_platform_category(filename)

    # If a source with this key already exists, append a short hash
    existing = db.query(models.Source).filter_by(key=source_key).first()
    if existing:
        import uuid
        source_key = f"{source_key}-{uuid.uuid4().hex[:6]}"

    source = models.Source(
        key=source_key,
        name=source_name,
        description=f"Auto-skapad från {filename}",
        platform=platform,
        category=category,
        detect_rules_json={"filename_patterns": [], "required_columns": []},
    )
    db.add(source)
    db.flush()

    # Create SourceFields + collect for mapping
    fields: List[models.SourceField] = []
    for col in df.columns:
        col_str = str(col).strip()
        if not col_str or col_str.startswith("Unnamed"):
            continue
        field = models.SourceField(
            source_id=source.id,
            key=slugify(col_str),
            display_name=col_str,
            data_type=_infer_data_type(df[col]),
        )
        db.add(field)
        db.flush()
        fields.append((field, col_str))

    # Create SourceVersion v1 with 1:1 mappings
    version = models.SourceVersion(
        source_id=source.id,
        version=1,
        is_current=True,
        notes=f"Auto-skapad från {filename}",
    )
    db.add(version)
    db.flush()

    for field, original_col in fields:
        db.add(models.SourceFieldMapping(
            source_version_id=version.id,
            source_field_id=field.id,
            column_name=original_col,
        ))

    db.flush()
    return source, version


def auto_create_version(
    db: Session,
    source: models.Source,
    current_version: models.SourceVersion,
    df: pd.DataFrame,
    filename: str,
) -> models.SourceVersion:
    """Create a new SourceVersion for a drifted file: add new fields, keep existing ones."""
    from helpers import slugify

    file_cols = _columns_of(df)
    existing_field_keys = {f.key: f for f in source.fields}

    # Add SourceFields for any new columns
    new_fields = []
    for col in file_cols:
        col_str = str(col).strip()
        if not col_str or col_str.startswith("Unnamed"):
            continue
        fkey = slugify(col_str)
        if fkey not in existing_field_keys:
            field = models.SourceField(
                source_id=source.id,
                key=fkey,
                display_name=col_str,
                data_type=_infer_data_type(df[col]),
            )
            db.add(field)
            db.flush()
            existing_field_keys[fkey] = field
            new_fields.append(col_str)

    # Mark old version as not current
    for v in source.versions:
        v.is_current = False

    new_version_num = max((v.version for v in source.versions), default=0) + 1
    version = models.SourceVersion(
        source_id=source.id,
        version=new_version_num,
        is_current=True,
        notes=f"Auto-skapad vid drift från {filename}. Nya kolumner: {', '.join(new_fields) if new_fields else 'inga'}",
    )
    db.add(version)
    db.flush()

    # Map ALL file columns to their SourceField
    for col in file_cols:
        col_str = str(col).strip()
        if not col_str or col_str.startswith("Unnamed"):
            continue
        fkey = slugify(col_str)
        field = existing_field_keys.get(fkey)
        if field:
            db.add(models.SourceFieldMapping(
                source_version_id=version.id,
                source_field_id=field.id,
                column_name=col_str,
            ))

    db.flush()
    return version


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


def detect_granularity(df: pd.DataFrame) -> Tuple[str, Optional[str], Optional[str]]:
    """Auto-detect granularity and period range from a DataFrame.
    
    Returns (granularity, period_start, period_end) where:
      - granularity: 'daily' | 'monthly' | 'aggregated' | 'unknown'
      - period_start/end: ISO date strings or None
    """
    DATE_COLS = {
        "start-date-in-utc", "date", "day", "created-date", "start date (in utc)",
        "datum", "period", "month", "månad", "start_date", "end_date",
    }
    
    # Find date columns
    date_col = None
    for col in df.columns:
        if col.strip().lower().replace("_", "-") in DATE_COLS:
            date_col = col
            break
    
    if date_col is None:
        # Try to find any column that looks like dates
        for col in df.columns:
            sample = df[col].dropna().head(10)
            date_count = 0
            for val in sample:
                s = str(val).strip()
                if len(s) >= 10:
                    try:
                        pd.Timestamp(s)
                        date_count += 1
                    except (ValueError, TypeError):
                        pass
            if date_count >= 3:
                date_col = col
                break
    
    if date_col is None:
        # No date column found — likely aggregated data
        if len(df) <= 5:
            return ("aggregated", None, None)
        return ("unknown", None, None)
    
    # Parse dates
    try:
        dates = pd.to_datetime(df[date_col], errors="coerce", utc=True)
    except Exception:
        try:
            dates = pd.to_datetime(df[date_col], errors="coerce")
        except Exception:
            return ("unknown", None, None)
    
    valid_dates = dates.dropna()
    if len(valid_dates) == 0:
        return ("unknown", None, None)
    
    period_start = valid_dates.min().strftime("%Y-%m-%d")
    period_end = valid_dates.max().strftime("%Y-%m-%d")
    
    if len(valid_dates) <= 1:
        return ("aggregated", period_start, period_end)
    
    # Determine granularity by looking at date intervals
    sorted_dates = valid_dates.sort_values()
    # Get unique dates (some rows may share a date if grouped by other dims)
    unique_dates = sorted_dates.dt.date.unique()
    
    if len(unique_dates) <= 1:
        return ("aggregated", period_start, period_end)
    
    # Calculate median gap between consecutive unique dates
    gaps = []
    for i in range(1, min(len(unique_dates), 50)):
        gap = (unique_dates[i] - unique_dates[i - 1]).days
        if gap > 0:
            gaps.append(gap)
    
    if not gaps:
        return ("unknown", period_start, period_end)
    
    median_gap = sorted(gaps)[len(gaps) // 2]
    
    if median_gap <= 2:
        return ("daily", period_start, period_end)
    elif median_gap <= 10:
        return ("weekly", period_start, period_end)
    elif median_gap <= 45:
        return ("monthly", period_start, period_end)
    elif median_gap <= 100:
        return ("quarterly", period_start, period_end)
    else:
        return ("yearly", period_start, period_end)


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

    # Auto-detect granularity and period
    granularity, period_start, period_end = detect_granularity(df)

    dataset = models.Dataset(
        customer_id=customer.id,
        source_id=source.id,
        source_version_id=version.id,
        original_filename=filename,
        sha256=sha,
        row_count=0,
        granularity=granularity,
        period_start=period_start,
        period_end=period_end,
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

