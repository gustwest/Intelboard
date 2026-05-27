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

from services.attested_ingest import SOURCE_TYPES, attested_status, ingest_attested

router = APIRouter(prefix="/api/attested", tags=["attested"])


@router.get("/source-types")
def list_source_types() -> dict[str, Any]:
    """Vilka officiella källtyper systemet kan ta emot, med läge + beskrivning för UI."""
    return {
        "source_types": [
            {"key": st.key, "label": st.label, "description": st.description, "mode": st.mode}
            for st in SOURCE_TYPES.values()
        ]
    }


@router.get("/{client_id}/status")
def status(client_id: str) -> dict[str, Any]:
    """Per källtyp: antal attesterade claims + senaste datum, för uppladdnings-UI:t."""
    return {"client_id": client_id, "source_types": attested_status(client_id)}


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
        # LinkedIns native-export (.xls/.xlsx) eller kanonisk CSV — ingesten väljer rätt.
        return ingest_attested(client_id, source_type, file.filename, raw, attested_at=attested_at, url=url)
    except ValueError as exc:
        # kund saknas / okänd source_type / ogiltig fil
        status = 404 if "client not found" in str(exc) else 400
        raise HTTPException(status, str(exc)) from exc
