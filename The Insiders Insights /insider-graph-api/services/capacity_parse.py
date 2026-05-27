"""Extrahera kompetenser (+ följarantal) ur uppladdade CSV/XLSX-filer.

Heuristisk best-effort: resultatet förfylls i snapshottet och verifieras alltid
manuellt i Granska → LinkedIn. Bild/PDF parsas INTE här (lagras som underlag;
LLM-/OCR-extraktion är ett separat steg). Får aldrig fälla uppladdningen — vid fel
returneras tom dict och filen blir bara underlag.
"""
from __future__ import annotations

import csv
import io
import re
from typing import Any

_SKILL_HEADER = re.compile(r"skill|kompeten|name|namn|titel|title", re.I)
_FOLLOW_HEADER = re.compile(r"follow|följ", re.I)
_NUMERIC = re.compile(r"^[\d\s.,%+-]+$")


def extract(filename: str | None, content_type: str | None, content: bytes) -> dict[str, Any]:
    """Returnerar {"skills": [...], "followers": int} så långt det går; annars {}."""
    rows = _read_rows(filename, content_type, content)
    return _from_rows(rows) if rows else {}


def _read_rows(filename: str | None, content_type: str | None, content: bytes) -> list[list[str]]:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()
    try:
        if name.endswith(".csv") or "csv" in ctype:
            text = content.decode("utf-8-sig", errors="ignore")
            sample = text[:2048]
            delim = ";" if sample.count(";") > sample.count(",") else ","
            return [[(c or "").strip() for c in row] for row in csv.reader(io.StringIO(text), delimiter=delim)]
        if name.endswith((".xlsx", ".xlsm", ".xls")):
            import openpyxl

            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            if ws is None:
                return []
            return [["" if c is None else str(c).strip() for c in row] for row in ws.iter_rows(values_only=True)]
    except Exception:  # noqa: BLE001 — parsning får aldrig fälla uppladdningen
        return []
    return []


def _from_rows(rows: list[list[str]]) -> dict[str, Any]:
    header = rows[0]
    skill_col = next((i for i, h in enumerate(header) if _SKILL_HEADER.search(h)), None)
    follow_col = next((i for i, h in enumerate(header) if _FOLLOW_HEADER.search(h)), None)

    has_header = skill_col is not None or follow_col is not None
    body = rows[1:] if has_header else rows
    col = skill_col if skill_col is not None else 0

    skills: list[str] = []
    seen: set[str] = set()
    for row in body:
        if col >= len(row):
            continue
        val = row[col].strip()
        if not val or _NUMERIC.match(val) or len(val) > 60 or val.lower() in seen:
            continue
        seen.add(val.lower())
        skills.append(val)

    followers: int | None = None
    if follow_col is not None:
        for row in body:
            if follow_col < len(row):
                n = _to_int(row[follow_col])
                if n is not None:
                    followers = n
                    break

    out: dict[str, Any] = {}
    if skills:
        out["skills"] = skills[:200]
    if followers is not None:
        out["followers"] = followers
    return out


def _to_int(s: str) -> int | None:
    digits = re.sub(r"[^\d]", "", s or "")
    return int(digits) if digits else None
