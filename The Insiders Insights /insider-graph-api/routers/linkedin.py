"""LinkedIn-connector: kundens kvartalsvisa kapacitets-uppladdning (spec §4).

Kunden laddar upp en export eller ett skärmklipp över bolagets SAMLADE följar- och
kompetensstatistik (helt utan persondata) plus de aggregerade kompetenserna som
strukturerad lista. Snapshottet sätts till PENDING_INTERNAL_VERIFICATION och väntar
på att en Geogiraph-administratör godkänner det (routers/review.py).

Följarantal lagras bara för intern visning — sociala mätvärden når aldrig grafen.
Det är de aggregerade kompetenserna som korsvalideras mot XML-annonserna (§4.3).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Response, UploadFile
from google.cloud import firestore

import firestore_client as fs
from schemas import LinkedInStatus
from services import blob_storage, capacity_parse

router = APIRouter(prefix="/api/linkedin", tags=["linkedin"])


def _parse_skills(raw: str) -> list[str]:
    """Kompetenser kommer som komma-/radseparerad sträng från uppladdningsformuläret."""
    parts = [p.strip() for chunk in (raw or "").splitlines() for p in chunk.split(",")]
    seen: dict[str, str] = {}
    for p in parts:
        if p and p.lower() not in seen:
            seen[p.lower()] = p
    return list(seen.values())


@router.post("/{client_id}/snapshots")
async def upload_snapshot(
    client_id: str,
    skills: str = Form("", description="Aggregerade kompetenser — valfritt här, kan fyllas/finslipas vid verifiering"),
    quarter: str | None = Form(None, description="t.ex. 2026-Q2"),
    followers: int | None = Form(None, description="Samlat följarantal — endast intern visning"),
    file: UploadFile | None = None,
) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    manual = _parse_skills(skills)
    snapshot_id = "snap-" + uuid.uuid4().hex[:12]

    # Läs filen en gång: använd den både för parsning (CSV/XLSX → kompetenser/följare)
    # och för att lagra underlaget. Bild/PDF parsas inte — lagras bara som underlag.
    file_path = None
    extracted: dict[str, Any] = {}
    if file:
        content = await file.read()
        extracted = capacity_parse.extract(file.filename, file.content_type, content)
        file_path = blob_storage.store(client_id, snapshot_id, file.filename or "", content, file.content_type)

    # Slå ihop: manuellt angivna först, sedan extraherade som inte redan finns.
    skills_final = list(manual)
    seen = {s.lower() for s in skills_final}
    for s in extracted.get("skills", []):
        if s.lower() not in seen:
            seen.add(s.lower())
            skills_final.append(s)
    followers_final = followers if followers is not None else extracted.get("followers")
    extracted_count = len(extracted.get("skills", []))

    # Skärmklipp eller kompetenser räcker — kompetenserna kan annars fyllas vid den
    # interna verifieringen (granskaren ser underlaget och skriver in dem då).
    if not skills_final and file is None:
        raise HTTPException(422, "ladda upp ett underlag (skärmklipp/export) eller ange minst en kompetens")

    fs.linkedin_snapshot_doc(client_id, snapshot_id).set(
        {
            "status": LinkedInStatus.PENDING,
            "is_active": False,
            "skills": skills_final,
            "skills_extracted_count": extracted_count,  # hur många som lästes ur filen
            "followers": followers_final,  # intern visning; mappas aldrig till grafen
            "quarter": quarter,
            "filename": file.filename if file else None,
            "file_path": file_path,
            "uploaded_at": firestore.SERVER_TIMESTAMP,
        }
    )

    # Kvitta ev. öppen kvartals-To-Do — uppladdningen är nu gjord.
    for tid, todo in fs.iter_todos(client_id):
        if todo.get("type") == "linkedin_quarterly" and todo.get("status") == "open":
            fs.todo_doc(client_id, tid).update({"status": "done", "done_at": firestore.SERVER_TIMESTAMP})

    return {
        "status": "ok",
        "snapshot_id": snapshot_id,
        "snapshot_status": LinkedInStatus.PENDING,
        "skills": skills_final,
        "extracted_from_file": extracted_count,
    }


@router.get("/{client_id}/snapshots")
def list_snapshots(client_id: str) -> dict[str, Any]:
    items = [
        {
            "id": sid,
            "status": s.get("status"),
            "is_active": bool(s.get("is_active")),
            "skills": s.get("skills", []),
            "quarter": s.get("quarter"),
            "uploaded_at": _iso(s.get("uploaded_at")),
            "verified_at": _iso(s.get("verified_at")),
        }
        for sid, s in fs.iter_linkedin_snapshots(client_id)
    ]
    items.sort(key=lambda x: x.get("uploaded_at") or "", reverse=True)
    return {"client_id": client_id, "snapshots": items}


@router.get("/{client_id}/snapshots/{snapshot_id}/file")
def download_snapshot_file(client_id: str, snapshot_id: str) -> Response:
    """Strömma det privat lagrade underlaget till granskaren (bakom admin-API-nyckeln)."""
    snap = fs.linkedin_snapshot_doc(client_id, snapshot_id).get()
    if not snap.exists:
        raise HTTPException(404, "snapshot not found")
    file_path = (snap.to_dict() or {}).get("file_path")
    fetched = blob_storage.fetch(file_path) if file_path else None
    if not fetched:
        raise HTTPException(404, "no stored file for this snapshot")
    content, content_type = fetched
    return Response(content=content, media_type=content_type)


@router.get("/{client_id}/todos")
def list_todos(client_id: str) -> dict[str, Any]:
    items = [
        {"id": tid, "type": t.get("type"), "status": t.get("status"), "message": t.get("message"),
         "created_at": _iso(t.get("created_at"))}
        for tid, t in fs.iter_todos(client_id)
        if t.get("status") == "open"
    ]
    return {"client_id": client_id, "todos": items}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)
