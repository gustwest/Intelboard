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
from services import blob_storage

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
    skills: str = Form(..., description="Aggregerade kompetenser, komma- eller radseparerade"),
    quarter: str | None = Form(None, description="t.ex. 2026-Q2"),
    followers: int | None = Form(None, description="Samlat följarantal — endast intern visning"),
    file: UploadFile | None = None,
) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    parsed = _parse_skills(skills)
    if not parsed:
        raise HTTPException(422, "minst en kompetens krävs")

    snapshot_id = "snap-" + uuid.uuid4().hex[:12]
    # Underlaget (export/skärmklipp) lagras privat så granskaren kan öppna det; faller
    # tillbaka på enbart filnamnet om ingen upload-bucket är konfigurerad.
    file_path = None
    if file:
        content = await file.read()
        file_path = blob_storage.store(client_id, snapshot_id, file.filename or "", content, file.content_type)
    fs.linkedin_snapshot_doc(client_id, snapshot_id).set(
        {
            "status": LinkedInStatus.PENDING,
            "is_active": False,
            "skills": parsed,
            "followers": followers,  # intern visning; mappas aldrig till grafen
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

    return {"status": "ok", "snapshot_id": snapshot_id, "snapshot_status": LinkedInStatus.PENDING, "skills": parsed}


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
