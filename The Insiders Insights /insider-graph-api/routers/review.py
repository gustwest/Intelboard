"""Review-flow för items som plockats in med låg confidence.

Items från `services/email_extraction.py` med confidence < 0.7 hamnar i
`needs_review=true, included_in_output=false`. Ops-användaren ser dem i UI
och godkänner eller avvisar. Godkända items flippar `included_in_output=true`
och tas med vid nästa schema-kompilering.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from google.cloud import firestore
from pydantic import BaseModel

import firestore_client as fs

router = APIRouter(prefix="/api/review", tags=["review"])


class ReviewAction(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = None


@router.get("/{client_id}")
def list_pending(client_id: str) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for emp_id, emp in fs.iter_employees(client_id):
        for snap in fs.raw_items_col(client_id, emp_id).where("needs_review", "==", True).stream():
            data = snap.to_dict() or {}
            if data.get("review_status") in ("approved", "rejected"):
                continue
            items.append(
                {
                    "id": snap.id,
                    "employee_id": emp_id,
                    "employee_name": emp.get("name"),
                    "schema_type": data.get("schema_type"),
                    "name": data.get("name"),
                    "content": data.get("content"),
                    "url": data.get("url"),
                    "from_email": data.get("from_email"),
                    "subject": data.get("subject"),
                    "confidence": data.get("confidence"),
                    "start_date": data.get("start_date"),
                    "organizer": data.get("organizer"),
                    "published_at": _iso(data.get("published_at")),
                    "created_at": _iso(data.get("created_at")),
                }
            )
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"client_id": client_id, "items": items}


@router.post("/{client_id}/{employee_id}/{item_id}")
def decide(client_id: str, employee_id: str, item_id: str, action: ReviewAction) -> dict[str, Any]:
    doc_ref = fs.raw_items_col(client_id, employee_id).document(item_id)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(404, "item not found")

    doc_ref.update(
        {
            "review_status": action.decision + "d",
            "review_note": action.note,
            "reviewed_at": firestore.SERVER_TIMESTAMP,
            "included_in_output": action.decision == "approve",
            "needs_review": False,
        }
    )
    return {"status": "ok", "decision": action.decision}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
