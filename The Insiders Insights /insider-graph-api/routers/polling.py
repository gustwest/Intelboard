"""Polling-resultat — read-endpoints för dashboards.

Aggregat per motor härleds vid läsning från raw_responses (ej lagrat), så att UI:t
kan visa per-motor-trend för befintlig historik utan schemamigration.
"""
from collections import defaultdict
from typing import Any, Iterable

from fastapi import APIRouter, HTTPException

import firestore_client as fs

router = APIRouter(prefix="/api/polling", tags=["polling"])


def _aggregate_per_engine(raw_responses: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Grupera raw_responses per motor → SoV/sentiment + mention-räknare. Tom dict om data saknas."""
    by_engine: dict[str, dict[str, list[Any]]] = defaultdict(lambda: {"answers": [], "mentions": [], "sentiments": []})
    for r in raw_responses or []:
        model = r.get("model") or "okänd"
        by_engine[model]["answers"].append(r)
        if r.get("mentioned"):
            by_engine[model]["mentions"].append(r)
            if r.get("sentiment") is not None:
                by_engine[model]["sentiments"].append(r["sentiment"])
    out: dict[str, dict[str, Any]] = {}
    for model, buckets in by_engine.items():
        total = len(buckets["answers"])
        mentions = len(buckets["mentions"])
        sents = buckets["sentiments"]
        out[model] = {
            "share_of_voice": (mentions / total) if total else 0.0,
            "sentiment_score": (sum(sents) / len(sents)) if sents else None,
            "answer_count": total,
            "mention_count": mentions,
        }
    return out


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
                "category_competitors": data.get("category_competitors") or {},
                "total_answers": data.get("total_answers"),
                "answers_with_mention": data.get("answers_with_mention"),
                "models_used": data.get("models_used"),
                "per_engine": _aggregate_per_engine(data.get("raw_responses") or []),
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
