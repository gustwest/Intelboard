"""Active gate på LinkedIn-demografi-claims (steg 4 i output-kvalitets-rollouten).

Bara den här connectorn är aktiv från dag 1 (känd leaker, se
[[feedback_demographics_are_social_proof]]). Alla andra claims scoreras passivt
via `services.output_quality_shadow` — den här modulen *mutaerar* claim-dokument.

**Vad gaten gör per claim:**

  * `action == "drop"`   → `included_in_output = False`, `needs_review = True`,
                          `review_status` rensas. Claimet hamnar i granskningskön
                          och försvinner ur nästa kompilering tills någon agerar.
  * `action == "transform"` → `needs_review = True` (claimet ligger kvar i bundlen
                          tills någon granskar och godkänner förslaget). Claim:et
                          får `gate_suggestion` med förslag på omformulering.
  * `action == "publish"`  → ingen mutation.

Vid `high_redundancy`-flagga på bundle-nivå sätts `needs_review=True` även på
"publish"-claims i den dimensionen — kollapsen behöver mänsklig hand.

**Gate måste köras FÖRE compile_schema.compile_client** så att mutationerna syns
i nästa render-modell. Egen log skrivs till `output_quality_logs/{id}` med
`source="gate"` så promotion-vyn (steg 5) kan särskilja diagnos från handling.

**Best-effort:** caller wrappar i try/except. Får aldrig fälla leveransen.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from services.output_quality import (
    AudiencePriority,
    RubricClaim,
    RubricRequest,
    score_bundle,
)
from services.output_quality_shadow import (
    _parse_audience_priorities,
    _resolve_connector,
    _resolve_schema_slot,
)

log = logging.getLogger(__name__)

# Origin-prefix som identifierar LinkedIn-demografi-claims (följare + besökare).
# Andra LinkedIn-typer (attested:linkedin_posts) lämnas i shadow mode — bara
# demografi är aktivt från dag 1.
LINKEDIN_DEMOGRAPHIC_PREFIXES = (
    "attested:linkedin_follower_demographics",
    "attested:linkedin_visitor_demographics",
)


def apply_gate(client_id: str) -> dict[str, Any] | None:
    """Kör active gate på LinkedIn-demografi-claims. Returnerar summering eller None
    om det inte fanns några sådana claims att hantera."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}

    target_claims = list(_iter_target_claims(client_id))
    if not target_claims:
        return None

    rubric_claims = [_to_rubric_claim(claim_id, raw) for claim_id, raw in target_claims]
    audience_priorities = _parse_audience_priorities(data.get("audience_priorities"))
    request = RubricRequest(
        client_id=client_id,
        company_name=data.get("company_name"),
        audience_priorities=audience_priorities,
        claims=rubric_claims,
    )
    response = score_bundle(request)

    # Om LLM:n är otillgänglig publiceras alla claims med score=0 → drop-action.
    # Det får INTE leda till att vi nuke:ar bundlen — bättre att lämna LinkedIn-
    # demografi orörd än att fel-flagga allt. Detektera och bail.
    if response.metadata.get("llm_unavailable"):
        log.info("gate: LLM otillgänglig för %s — hoppar över mutation", client_id)
        return {"skipped": "llm_unavailable", "claim_count": len(target_claims)}

    redundant_hints = {
        f.dimension_hint
        for f in response.bundle_flags
        if f.type == "high_redundancy" and f.dimension_hint
    }

    actions: list[dict[str, Any]] = []
    for (claim_id, raw), per_claim in zip(target_claims, response.per_claim):
        mutation = _decide_mutation(raw, per_claim, redundant_hints)
        if mutation:
            try:
                fs.claim_doc(client_id, claim_id).update(mutation)
            except Exception:  # noqa: BLE001 — claim-skrivning får inte fälla leveransen
                log.exception("gate: kunde inte uppdatera claim %s/%s", client_id, claim_id)
                continue
        actions.append({
            "claim_id": claim_id,
            "action": per_claim.action,
            "score": per_claim.score,
            "dimension_hint": per_claim.dimension_hint,
            "redundant": per_claim.dimension_hint in redundant_hints,
            "mutated": bool(mutation),
        })

    log_id = _build_log_id()
    _persist_gate_log(client_id, log_id, response, actions)

    counts = _action_counts(actions)
    return {
        "log_id": log_id,
        "claim_count": len(target_claims),
        "actions": counts,
        "bundle_score": response.bundle_score,
        "verdict": response.verdict,
        "redundant_hints": sorted(redundant_hints),
    }


# --- Identifiering & mappning ------------------------------------------------


def _iter_target_claims(client_id: str):
    """Yield (claim_id, raw) för LinkedIn-demografi-claims som fortfarande är
    relevanta för gating. Vi inkluderar både `included_in_output=True` och
    redan-droppade — om en tidigare gate-körning satte included_in_output=False
    vill vi ändå re-evaluera (rubric:en kan ha kalibrerats)."""
    for claim_id, raw in fs.iter_claims(client_id):
        if raw.get("review_status") == "rejected":
            # Människa har redan avvisat → respektera det, gate rör inte.
            continue
        origin = raw.get("origin") or ""
        if not any(origin.startswith(p) for p in LINKEDIN_DEMOGRAPHIC_PREFIXES):
            continue
        yield claim_id, raw


def _to_rubric_claim(claim_id: str, raw: dict[str, Any]) -> RubricClaim:
    sources = raw.get("source") or []
    return RubricClaim(
        claim_id=claim_id,
        statement=raw.get("statement"),
        predicate=raw.get("predicate"),
        value=raw.get("value"),
        claim_kind=raw.get("claim_kind") or "narrative",
        facet=raw.get("facet") or "operational",
        connector=_resolve_connector(raw),
        schema_slot=_resolve_schema_slot(raw),
        has_source=len(sources) > 0,
    )


# --- Mutationslogik ----------------------------------------------------------


def _decide_mutation(
    raw: dict[str, Any], per_claim: Any, redundant_hints: set[str]
) -> dict[str, Any] | None:
    """Returnera fält att skriva på claim-doc:et — eller None om inget ändras."""
    update: dict[str, Any] = {}
    gate_payload = {
        "score": per_claim.score,
        "action": per_claim.action,
        "dimension_hint": per_claim.dimension_hint,
        "reasons": list(per_claim.reasons),
        "suggestion": per_claim.suggestion,
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }

    is_redundant = per_claim.dimension_hint in redundant_hints

    if per_claim.action == "drop":
        # Bort ur output + tillbaka in i granskningskön. Granskaren ser action="drop"
        # och rubric:ens skäl, kan välja att åter-inkludera om felaktigt.
        if raw.get("included_in_output", True) is not False or not raw.get("needs_review"):
            update["included_in_output"] = False
            update["needs_review"] = True
            update["review_status"] = None
    elif per_claim.action == "transform" or is_redundant:
        # Transform = flagga för granskning men låt claimet ligga kvar i bundlen tills
        # någon godkänner förslaget. Samma sak för redundans-träffade publish-claims.
        if not raw.get("needs_review"):
            update["needs_review"] = True
    # action="publish" utan redundans → ingen mutation.

    if not update:
        # Inget state-byte — men gate-spår uppdateras ändå så vi har en färsk decision.
        # Detta är intentionellt: det säger "gaten såg den, lät den passera". Mängden
        # skrivningar är liten (en per LinkedIn-demografi-claim per leverans).
        return {"gate_decision": gate_payload}

    update["gate_decision"] = gate_payload
    return update


def _action_counts(actions: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"publish": 0, "transform": 0, "drop": 0, "redundant": 0, "mutated": 0}
    for a in actions:
        counts[a["action"]] = counts.get(a["action"], 0) + 1
        if a["redundant"]:
            counts["redundant"] += 1
        if a["mutated"]:
            counts["mutated"] += 1
    return counts


# --- Persistering ------------------------------------------------------------


def _build_log_id() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y%m%dT%H%M%S%f')}-gate-{uuid.uuid4().hex[:6]}"


def _persist_gate_log(
    client_id: str,
    log_id: str,
    response: Any,
    actions: list[dict[str, Any]],
) -> None:
    doc = {
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "source": "gate",
        "connector": "linkedin_capacity",
        "scope": "demographics",
        "bundle_score": response.bundle_score,
        "verdict": response.verdict,
        "claim_count": len(actions),
        "actions": actions,
        "bundle_flags": [f.model_dump() for f in response.bundle_flags],
        "top_improvements": response.top_improvements,
        "metadata": response.metadata,
    }
    try:
        fs.output_quality_log_doc(client_id, log_id).set(doc)
    except Exception:  # noqa: BLE001
        log.exception("gate: kunde inte skriva gate-log %s", log_id)
