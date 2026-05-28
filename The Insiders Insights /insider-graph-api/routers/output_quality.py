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

from fastapi import APIRouter, Query

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
