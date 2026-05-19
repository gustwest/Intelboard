"""Polling-resultat — read-endpoints för dashboards."""
from typing import Any

from fastapi import APIRouter, HTTPException

import firestore_client as fs

router = APIRouter(prefix="/api/polling", tags=["polling"])


@router.get("/{client_id}")
def list_results(client_id: str, limit: int = 12) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    weeks = []
    for snap in fs.polling_results_col(client_id).stream():
        data = snap.to_dict() or {}
        weeks.append(
            {
                "week_id": snap.id,
                "share_of_voice": data.get("share_of_voice"),
                "sentiment_score": data.get("sentiment_score"),
                "parity_index": data.get("parity_index"),
                "category_results": data.get("category_results"),
                "total_answers": data.get("total_answers"),
                "answers_with_mention": data.get("answers_with_mention"),
                "models_used": data.get("models_used"),
            }
        )
    weeks.sort(key=lambda w: w["week_id"], reverse=True)
    return {"client_id": client_id, "weeks": weeks[:limit]}


@router.get("/{client_id}/{week_id}/raw")
def get_raw_responses(client_id: str, week_id: str) -> dict[str, Any]:
    snap = fs.polling_results_col(client_id).document(week_id).get()
    if not snap.exists:
        raise HTTPException(404, "polling result not found")
    data = snap.to_dict() or {}
    return {
        "client_id": client_id,
        "week_id": week_id,
        "raw_responses": data.get("raw_responses", []),
    }
