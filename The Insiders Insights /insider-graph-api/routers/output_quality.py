"""Output-kvalitets-rubric: scorar en bundle av claims före publicering.

Tunn FastAPI-router kring `services.output_quality.score_bundle` — ingen DB,
ingen persisterad state. Designad för att anropas både synkront från recompile-
flödet (shadow mode i steg 3) och som standalone-API för diagnos från UI.

    POST /api/output-quality/score
        body: RubricRequest (audience_priorities + claims + company_name)
        → RubricResponse (bundle_score, verdict, per_claim, bundle_flags, …)

Ingen sideffekt: anropet är säkert att köra om hur många gånger som helst utan
att förändra något. Persisterad spårning byggs i steg 3 (shadow-mode-loggen)
separat så själva rubric:en kan testas isolerat.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

import firestore_client as fs
from services.output_quality import RubricRequest, RubricResponse, score_bundle
from services.output_quality_aggregator import DEFAULT_WINDOW_DAYS, aggregate_connector_scores

router = APIRouter(prefix="/api/output-quality", tags=["output-quality"])


@router.post("/score", response_model=RubricResponse)
def score(request: RubricRequest) -> RubricResponse:
    """Scorar en bundle av claims. Ren funktion — inga DB-skrivningar."""
    return score_bundle(request)


@router.get("/connector-scores")
def connector_scores(
    client_id: str | None = Query(default=None, description="Per-kund-vy. Utelämna för cross-client."),
    days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=180),
) -> dict[str, Any]:
    """Aggregerade per-connector-stats från output_quality_logs.

    Driver promotion-beslut shadow → active gate. Sortering: lägst avg_score först
    (sämsta connector överst = nästa promotion-kandidat)."""
    return aggregate_connector_scores(client_id=client_id, window_days=days)


# --- Per-kund-loggar (driver kundkort-panel + detaljsida) ---


@router.get("/logs/{client_id}")
def list_logs(
    client_id: str,
    limit: int = Query(default=20, ge=1, le=200),
    source: str | None = Query(
        default=None,
        description="Filtrera på source: compile_schema | gate. Utelämna för alla.",
    ),
) -> dict[str, Any]:
    """Listar output_quality_logs för en kund, nyaste först.

    Returnerar bara översiktsfält (inte per_claim/claim_meta) så listan blir
    snabb även när loggarna är stora. För full detalj använd /logs/{client_id}/{log_id}."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    items: list[dict[str, Any]] = []
    for log_id, doc in fs.iter_output_quality_logs(client_id):
        if source and doc.get("source") != source:
            continue
        items.append({
            "log_id": log_id,
            "logged_at": doc.get("logged_at"),
            "source": doc.get("source"),
            "scope": doc.get("scope"),               # endast gate-loggar
            "connector": doc.get("connector"),       # endast gate-loggar
            "bundle_score": doc.get("bundle_score"),
            "verdict": doc.get("verdict"),
            "claim_count": doc.get("claim_count"),
            "audience_count": doc.get("audience_count"),
            "flag_count": len(doc.get("bundle_flags") or []),
            "llm_unavailable": bool((doc.get("metadata") or {}).get("llm_unavailable")),
        })
    items.sort(key=lambda x: x.get("log_id") or "", reverse=True)
    return {
        "client_id": client_id,
        "items": items[:limit],
        "total": len(items),
    }


@router.get("/logs/{client_id}/{log_id}")
def get_log(client_id: str, log_id: str) -> dict[str, Any]:
    """Hämtar en specifik logg med fullt innehåll (per_claim, bundle_flags m.m.)."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    snap = fs.output_quality_log_doc(client_id, log_id).get()
    if not snap.exists:
        raise HTTPException(404, f"log not found: {log_id}")
    doc = snap.to_dict() or {}
    return {"log_id": log_id, **doc}
