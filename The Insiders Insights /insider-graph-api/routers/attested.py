"""Attesterad uppladdning — operatör laddar upp officiell tredjepartsdata.

Vi (inte kunden) har laddat ner filen direkt från källan, så uppladdningen sker
operatör-sida och skyddas av admin-API-nyckeln (auth.py). Filen tolkas, valideras
och blir attesterade claims (services/attested_ingest.py).

    POST /api/attested/{client_id}/{source_type}
        multipart: file=<csv>, attested_at=<ISO-datum>, url=<valfri publik ankare>
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Form, HTTPException, UploadFile

from services.attested_ingest import PARSERS, ingest_attested_csv

router = APIRouter(prefix="/api/attested", tags=["attested"])


@router.get("/source-types")
def list_source_types() -> dict[str, Any]:
    """Vilka officiella källtyper systemet kan ta emot just nu."""
    return {"source_types": sorted(PARSERS)}


@router.post("/{client_id}/{source_type}")
async def upload_attested(
    client_id: str,
    source_type: str,
    file: UploadFile,
    attested_at: str = Form(...),
    url: str | None = Form(None),
) -> dict[str, Any]:
    raw = await file.read()
    try:
        csv_text = raw.decode("utf-8-sig")  # tål BOM från exporter
    except UnicodeDecodeError:
        raise HTTPException(400, "file is not valid UTF-8 text")

    try:
        return ingest_attested_csv(client_id, source_type, csv_text, attested_at=attested_at, url=url)
    except ValueError as exc:
        # kund saknas / okänd source_type / ogiltig CSV
        status = 404 if "client not found" in str(exc) else 400
        raise HTTPException(status, str(exc)) from exc
