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

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from google.cloud import firestore
from pydantic import BaseModel, Field

import firestore_client as fs
from services.claim_aggregation import AggregationResult, aggregate_claims
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


# --- Källtillit: per-connector auto-godkänn-tröskel (AR1 d) ---


class ConnectorTrustUpdate(BaseModel):
    thresholds: dict[str, float]


@router.get("/connector-trust")
def get_connector_trust() -> dict[str, Any]:
    """Per-connector auto-godkänn-trösklar (global). Tom karta = alla på default."""
    from services import connector_trust
    return {
        "thresholds": connector_trust.get_thresholds(),
        "default": connector_trust.DEFAULT_THRESHOLD,
        "floor": connector_trust.FLOOR,
    }


@router.put("/connector-trust")
def put_connector_trust(payload: ConnectorTrustUpdate) -> dict[str, Any]:
    """Skriv hela trösklar-kartan. Värden klampas till [floor, 1.0]; utelämna en
    connector för att återgå till default."""
    from services import connector_trust
    saved = connector_trust.set_thresholds(payload.thresholds)
    return {"status": "ok", "thresholds": saved}


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


# --- Applicera förslag: stänger loopen observation → optimerad output ---


class ApplySuggestionRequest(BaseModel):
    """Användaren accepterar rubric:ens föreslagna omformulering för ett claim.

    Resultat: claim:ets statement byts ut, original sparas för audit (en gång),
    claim markeras godkänt och nästa compile_schema plockar upp den nya texten.
    Vi triggar en background-recompile direkt så användaren ser effekten snabbt."""

    suggestion: str = Field(..., min_length=1, description="Den text rubric:en föreslog")
    source_log_id: str | None = Field(
        default=None, description="Vilken output_quality_log förslaget kom från (audit)"
    )


@router.post("/apply-suggestion/{client_id}/{claim_id}")
def apply_suggestion(
    client_id: str,
    claim_id: str,
    payload: ApplySuggestionRequest,
    background: BackgroundTasks,
) -> dict[str, Any]:
    """Byt ut claim.statement mot rubric:ens suggestion och godkänn claimet.

    - Original-statement bevaras i `original_statement` (sätts bara första gången,
      så upprepade applies inte skriver över den verkliga ursprungstexten).
    - claim flippas till `review_status=approved`, `needs_review=False`,
      `included_in_output=True` — alltså opt-in i nästa render.
    - `suggestion_applied_at` + `suggestion_applied_from_log` ger spårbarhet.
    - log_event() skapar en post i job_runs så det syns i kund-tidslinjen.
    - BackgroundTasks triggar `compile_schema` så outputen uppdateras snart.
    """
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    doc_ref = fs.claim_doc(client_id, claim_id)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(404, f"claim not found: {claim_id}")
    existing = snap.to_dict() or {}

    original = existing.get("original_statement") or existing.get("statement") or ""
    new_statement = payload.suggestion.strip()
    if not new_statement:
        raise HTTPException(422, "suggestion får inte vara tom")
    if new_statement == existing.get("statement"):
        # Idempotens — om någon klickar två gånger på samma förslag
        return {"status": "noop", "claim_id": claim_id, "reason": "already_applied"}

    now_iso = datetime.now(timezone.utc).isoformat()
    # VIKTIGT: validated_at och reviewed_at MÅSTE vara ISO-strängar — Claim-modellen
    # i schemas.py har `validated_at: str | None` och kraschar compile_client om vi
    # skriver firestore.SERVER_TIMESTAMP (blir DatetimeWithNanoseconds vid läsning).
    update: dict[str, Any] = {
        "statement": new_statement,
        # Bevara originalet bara om vi inte redan har det
        "original_statement": existing.get("original_statement") or original,
        "review_status": "approved",
        "needs_review": False,
        "included_in_output": True,
        "reviewed_at": now_iso,
        "suggestion_applied_at": now_iso,
        "suggestion_applied_from_log": payload.source_log_id,
        # Markera den som validerad — det här är en mänsklig godkännande, ej maskin.
        "validated_at": existing.get("validated_at") or now_iso,
        "validated_by": existing.get("validated_by") or "granskare (applicerat förslag)",
    }
    # Om existing validated_at är ett DatetimeWithNanoseconds-objekt (gammal bug),
    # konvertera till ISO. Annars kraschar Claim(**raw) vid nästa compile.
    if update["validated_at"] and not isinstance(update["validated_at"], str):
        update["validated_at"] = now_iso
    doc_ref.update(update)

    # Affärshändelse → kund-tidslinjen
    from jobs._run_tracker import log_event

    log_event(
        "suggestion_applied",
        client_id,
        {
            "claim_id": claim_id,
            "source_log_id": payload.source_log_id,
            "original_statement": original[:200],
            "new_statement": new_statement[:200],
        },
    )

    # Trigga recompile i bakgrunden så outputen uppdateras snart
    def _recompile() -> None:
        from jobs import compile_schema
        compile_schema.run(client_id)
    background.add_task(_recompile)

    return {
        "status": "ok",
        "claim_id": claim_id,
        "original_statement": original,
        "new_statement": new_statement,
        "applied_at": now_iso,
    }


# --- Aggregera dimension: kollapsa N atomära claims till 1-2 narratives ---


class AggregateRequest(BaseModel):
    """Frontend skickar de claim_ids som ska kollapsas + (valfritt) dimension_hint
    + apply-flagga. Preview (`apply=false`) gör bara LLM-syntesen utan mutation;
    apply (`apply=true`) skapar nya claims och deaktiverar originalen."""

    claim_ids: list[str] = Field(..., min_length=2)
    dimension_hint: str | None = None
    source_log_id: str | None = None  # för audit (vilken logg flaggan kom från)
    apply: bool = False


@router.post("/aggregate/{client_id}", response_model=AggregationResult)
def aggregate_dimension(
    client_id: str,
    payload: AggregateRequest,
    background: BackgroundTasks,
) -> AggregationResult:
    """Syntetisera N atomära claims i samma dimension till 1-2 narratives.

    Två-stegs UX: först preview (apply=false), sen apply (apply=true) efter
    att användaren bekräftat förslaget. Vid apply: claim_docs muteras, ett
    compile_schema triggas i bakgrunden så outputen uppdateras snart."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    result = aggregate_claims(
        client_id=client_id,
        claim_ids=payload.claim_ids,
        dimension_hint=payload.dimension_hint,
        apply=payload.apply,
    )
    if result.llm_unavailable:
        raise HTTPException(503, "validator-LLM otillgänglig (Vertex AI EU ej konfigurerad)")
    if not result.narratives:
        raise HTTPException(
            422,
            "för få aggregerbara claims (originalen kan ha avvisats eller redan aggregerats)",
        )

    if result.applied:
        # Recompile i bakgrunden så grafen uppdateras snart
        def _recompile() -> None:
            from jobs import compile_schema
            compile_schema.run(client_id)
        background.add_task(_recompile)

    return result
