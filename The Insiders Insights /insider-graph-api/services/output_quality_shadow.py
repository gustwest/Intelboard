"""Shadow-mode-koppling: scorea varje leverans, logga resultatet, blockera ingenting.

Anropas best-effort från `jobs/compile_schema.run()` efter att render-modellen byggts.
Vi läser persisterade claims (samma som ingår i grafen), mappar dem till `RubricClaim`,
hämtar kundens audience_priorities och kör `services.output_quality.score_bundle`.

**Inga sideffekter på leveransen** — den här modulen är medvetet ren mot publish-flödet.
Ett misslyckat shadow-anrop får aldrig fälla compile_schema (caller wrappar med try/except).

Loggen skrivs till `clients/{id}/output_quality_logs/{log_id}` och driver:
  * connector-score-vyn (steg 5)
  * promotion-beslut shadow → active gate (steg 4)
  * trendning över tid mot perception-loopen ([[project_ai_visibility_loop_automated]])
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from services.output_quality import (
    AudiencePriority,
    PersonaTarget,
    RubricClaim,
    RubricRequest,
    score_bundle,
)

log = logging.getLogger(__name__)


def run_shadow(client_id: str, source: str = "compile_schema") -> dict[str, Any] | None:
    """Kör shadow-rubric:en för en kund och persistera loggen.

    Returnerar en kort summering (för inkludering i compile_schema:s run.summary)
    eller None vid kund-saknad / inga claims. Aldrig kastar — caller wrappar."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}

    claims, claim_meta = _build_rubric_claims(client_id)
    if not claims:
        return None

    audience_priorities = _parse_audience_priorities(data.get("audience_priorities"))
    request = RubricRequest(
        client_id=client_id,
        company_name=data.get("company_name"),
        audience_priorities=audience_priorities,
        claims=claims,
    )
    response = score_bundle(request)

    log_id = _build_log_id(source)
    _persist_log(client_id, log_id, source, request, response, claim_meta)

    return {
        "log_id": log_id,
        "bundle_score": response.bundle_score,
        "verdict": response.verdict,
        "claim_count": len(claims),
        "flag_count": len(response.bundle_flags),
        "llm_unavailable": bool(response.metadata.get("llm_unavailable")),
    }


# --- Klausmappning -----------------------------------------------------------


def _build_rubric_claims(client_id: str) -> tuple[list[RubricClaim], list[dict[str, Any]]]:
    """Iterera persisterade claims som hamnar i grafen och bygg RubricClaim + meta-rader.

    Bara claims som faktiskt publiceras (included_in_output, ej rejected) räknas —
    spegelt urvalet i schema_org/compiler._iter_output_claims men utan att bygga
    upp Claim-modellen (vi behöver origin-fältet som inte finns på Claim)."""
    claims: list[RubricClaim] = []
    meta: list[dict[str, Any]] = []
    for claim_id, raw in fs.iter_claims(client_id):
        if not raw.get("included_in_output", True):
            continue
        if raw.get("review_status") == "rejected":
            continue
        connector = _resolve_connector(raw)
        slot = _resolve_schema_slot(raw)
        sources = raw.get("source") or []
        has_source = len(sources) > 0

        claims.append(RubricClaim(
            claim_id=claim_id,
            statement=raw.get("statement"),
            predicate=raw.get("predicate"),
            value=raw.get("value"),
            claim_kind=raw.get("claim_kind") or "narrative",
            facet=raw.get("facet") or "operational",
            connector=connector,
            schema_slot=slot,
            has_source=has_source,
        ))
        meta.append({
            "claim_id": claim_id,
            "connector": connector,
            "origin": raw.get("origin") or "",
            "facet": raw.get("facet") or "operational",
        })
    return claims, meta


def _resolve_connector(raw: dict[str, Any]) -> str:
    """Heuristik: connector-id ur origin-fältet + sekundärt ur source[].url.

    Detaljerade origin-strängar (t.ex. attested:linkedin_follower_demographics)
    bevaras separat i meta-loggen så step 4 kan skilja demografi från övrig
    LinkedIn-data. Här returneras bara en grov bucket."""
    origin = raw.get("origin") or ""
    if origin.startswith("attested:linkedin_"):
        return "linkedin_capacity"
    if origin.startswith("attested:"):
        return origin.split(":", 1)[1]  # t.ex. gleif, esg
    if origin.startswith("verified:"):
        return "verification"
    if origin == "source:upload":
        return "manual_upload"
    # Saknad origin → härled ur källan
    for src in raw.get("source") or []:
        url = (src.get("url") or "").lower()
        if "linkedin.com" in url:
            return "linkedin"
        if any(host in url for host in (".se", ".com", ".org", ".net")):
            return "website"
    return "extraction"


def _resolve_schema_slot(raw: dict[str, Any]) -> str:
    """Vilken JSON-LD-slot claimet hamnar i. Approximation: property-claim → predicate,
    narrative → 'description' (compiler bygger description av prosa-claimsen)."""
    if raw.get("claim_kind") == "property" and raw.get("predicate"):
        return str(raw["predicate"])
    return "description"


def _parse_audience_priorities(raw: Any) -> list[AudiencePriority]:
    """Robust läsare för audience_priorities ur Firestore (lista av dicts)."""
    if not isinstance(raw, list):
        return []
    result: list[AudiencePriority] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        audience_type = item.get("audience_type")
        if audience_type not in ("customer", "candidate", "investor"):
            continue
        try:
            weight = float(item.get("weight", 0.0))
        except (TypeError, ValueError):
            weight = 0.0
        personas_raw = item.get("personas") or []
        personas: list[PersonaTarget] = []
        for p in personas_raw:
            if not isinstance(p, dict) or not p.get("role"):
                continue
            personas.append(PersonaTarget(
                role=str(p.get("role")),
                industry=p.get("industry"),
                company_size=p.get("company_size"),
                description=p.get("description"),
            ))
        narrative_axes = [
            str(a).strip()
            for a in (item.get("narrative_axes") or [])
            if isinstance(a, str) and a.strip()
        ]
        result.append(AudiencePriority(
            audience_type=audience_type,
            weight=max(0.0, min(1.0, weight)),
            personas=personas,
            narrative_axes=narrative_axes,
        ))
    return result


# --- Persistering ------------------------------------------------------------


def _build_log_id(source: str) -> str:
    """Tidsmärkt sorterbart id (samma mönster som job_runs) → enkel kronologisk listning."""
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y%m%dT%H%M%S%f')}-{source}-{uuid.uuid4().hex[:6]}"


def _persist_log(
    client_id: str,
    log_id: str,
    source: str,
    request: RubricRequest,
    response: Any,
    claim_meta: list[dict[str, Any]],
) -> None:
    """Skriv loggen. Per-claim-detaljer + per-connector-räkningar lagras tillsammans
    så connector-score-vyn (steg 5) kan aggregera utan att fan-out:a till varje claim-doc."""
    per_connector = _aggregate_per_connector(response.per_claim, claim_meta)

    doc = {
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "source": source,                         # compile_schema, recompile, …
        "bundle_score": response.bundle_score,
        "verdict": response.verdict,
        "claim_count": len(request.claims),
        "audience_count": len(request.audience_priorities),
        "metadata": response.metadata,
        "per_claim": [c.model_dump() for c in response.per_claim],
        "bundle_flags": [f.model_dump() for f in response.bundle_flags],
        "top_improvements": response.top_improvements,
        "per_connector": per_connector,
        "claim_meta": claim_meta,                 # origin-strängar bevaras för fas-4-filtrering
    }
    try:
        fs.output_quality_log_doc(client_id, log_id).set(doc)
    except Exception:  # noqa: BLE001 — best effort, får aldrig fälla compile_schema
        log.exception("output_quality_shadow: kunde inte skriva loggen %s", log_id)


def _aggregate_per_connector(
    per_claim: list[Any], claim_meta: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Räkningar per connector i en enskild körning — räcker för steg 5-aggregering över tid."""
    by_connector: dict[str, dict[str, Any]] = {}
    for score, meta in zip(per_claim, claim_meta):
        connector = meta.get("connector") or "unknown"
        bucket = by_connector.setdefault(connector, {
            "claim_count": 0,
            "score_sum": 0.0,
            "action_counts": {"publish": 0, "transform": 0, "drop": 0},
            "origins": {},
        })
        bucket["claim_count"] += 1
        bucket["score_sum"] += score.score
        bucket["action_counts"][score.action] = bucket["action_counts"].get(score.action, 0) + 1
        origin = meta.get("origin") or ""
        if origin:
            bucket["origins"][origin] = bucket["origins"].get(origin, 0) + 1

    # Räkna avg_score per bucket (mer användbart än sum i UI:t)
    for bucket in by_connector.values():
        n = bucket["claim_count"]
        bucket["avg_score"] = round(bucket["score_sum"] / n, 2) if n else 0.0
        del bucket["score_sum"]
    return by_connector
