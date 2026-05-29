"""Aggregera N atomära claims i samma dimension till 1-2 syntetiserade narratives.

Driver `POST /api/output-quality/aggregate/{client_id}`. Designat för att stänga
loopen mellan rubric:ens flagga (`high_redundancy:industry — 14 claims`) och en
faktisk minskning i bundlen ("14 → 1-2 syntes").

**Två lägen:**

  * `preview` — kör bara LLM-syntesen och returnerar förslaget; inga skrivningar.
  * `apply`   — efter användarens godkännande: skapa nya narrative-claims, markera
    originalen som aggregerade (`included_in_output=False`, `review_status="aggregated"`,
    `aggregated_into=[<new_ids>]`), trigga compile_schema-recompile.

**Källspår:** Varje original-claim bär en attested-källa (t.ex. LinkedIn-data
verifierad av Geogiraph). Det syntetiserade claimet får EN attested-källa med
färskast `attested_at` av originalen och en label som signalerar syntesen
("Sammanfattning av N LinkedIn-data-punkter, verifierad av Geogiraph"). Original-
claims behålls i Firestore som evidens — bara `included_in_output=False`.

**EU-only:** LLM:n hämtas via `services.llm.make_validator()` (Gemini 2.5 Pro
i Vertex EU). None vid saknad GCP → endpoint returnerar 503.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

import firestore_client as fs
from services.llm import invoke_json, make_validator
from services.output_quality import AudiencePriority, PersonaTarget
from services.output_quality_shadow import _parse_audience_priorities

log = logging.getLogger(__name__)

MAX_NARRATIVES = 2
MAX_NARRATIVE_WORDS = 25
MIN_CLAIMS_TO_AGGREGATE = 2


class AggregationResult(BaseModel):
    """Returnerat förslag (preview) eller resultat (apply)."""

    narratives: list[str] = Field(default_factory=list)
    # Endast satta efter apply: ids på de nya claims som skapades
    new_claim_ids: list[str] = Field(default_factory=list)
    aggregated_claim_ids: list[str] = Field(default_factory=list)
    llm_unavailable: bool = False
    applied: bool = False


def aggregate_claims(
    client_id: str,
    claim_ids: list[str],
    dimension_hint: str | None,
    apply: bool,
) -> AggregationResult:
    """Syntetisera N claims till 1-2 narratives. Apply=False = bara preview."""
    if len(claim_ids) < MIN_CLAIMS_TO_AGGREGATE:
        return AggregationResult(narratives=[], aggregated_claim_ids=list(claim_ids))

    # Läs befintliga claims (filtrera bort de som inte finns eller redan är ut-publicerade)
    raw_claims: list[tuple[str, dict[str, Any]]] = []
    for cid in claim_ids:
        snap = fs.claim_doc(client_id, cid).get()
        if not snap.exists:
            continue
        data = snap.to_dict() or {}
        # Inkludera bara claims som faktiskt skulle hamna i outputen — annars
        # aggregerar vi onödigt (gate kan ha dragit ut dem redan).
        if data.get("review_status") == "rejected":
            continue
        raw_claims.append((cid, data))

    if len(raw_claims) < MIN_CLAIMS_TO_AGGREGATE:
        return AggregationResult(narratives=[], aggregated_claim_ids=[cid for cid, _ in raw_claims])

    # Audience-priorities + company_name för LLM-kontexten
    client_snap = fs.client_doc(client_id).get()
    client_data = client_snap.to_dict() or {}
    audience_priorities = _parse_audience_priorities(client_data.get("audience_priorities"))
    company_name = client_data.get("company_name")

    narratives = _synthesize_with_llm(
        statements=[(c.get("statement") or "") for _, c in raw_claims],
        dimension_hint=dimension_hint,
        audience_priorities=audience_priorities,
        company_name=company_name,
    )
    if narratives is None:
        return AggregationResult(
            narratives=[],
            aggregated_claim_ids=[cid for cid, _ in raw_claims],
            llm_unavailable=True,
        )

    if not apply:
        return AggregationResult(
            narratives=narratives,
            aggregated_claim_ids=[cid for cid, _ in raw_claims],
        )

    # Apply: skapa nya claims + markera originalen som aggregerade
    new_ids = _persist_aggregation(client_id, narratives, raw_claims, dimension_hint)
    return AggregationResult(
        narratives=narratives,
        new_claim_ids=new_ids,
        aggregated_claim_ids=[cid for cid, _ in raw_claims],
        applied=True,
    )


# --- LLM-syntes --------------------------------------------------------------


def _synthesize_with_llm(
    statements: list[str],
    dimension_hint: str | None,
    audience_priorities: list[AudiencePriority],
    company_name: str | None,
) -> list[str] | None:
    """Anropa validator-LLM:n. None vid otillgänglighet eller trasigt svar."""
    llm = make_validator()
    if llm is None:
        return None

    system = _build_system_prompt(dimension_hint)
    user = _build_user_prompt(statements, audience_priorities, company_name)
    raw = invoke_json(llm, system, user)
    if not raw or "narratives" not in raw:
        log.warning("aggregation: LLM returned no usable narratives")
        return None
    out = []
    for n in (raw.get("narratives") or []):
        if not isinstance(n, str):
            continue
        n = n.strip()
        if not n:
            continue
        # Klippa till en rimlig ordlängd så LLM inte rymmer
        words = n.split()
        if len(words) > MAX_NARRATIVE_WORDS * 2:
            n = " ".join(words[:MAX_NARRATIVE_WORDS * 2])
        out.append(n)
    return out[:MAX_NARRATIVES] if out else None


def _build_system_prompt(dimension_hint: str | None) -> str:
    dim_note = f" (dimension: {dimension_hint})" if dimension_hint else ""
    return (
        f"Du syntetiserar flera atomära claims om ett bolag{dim_note} till EN eller "
        f"max {MAX_NARRATIVES} kortare narratives som är MER citerbara av AI-motorer.\n\n"
        "Mål: ta N atomära statements som upprepar samma dimension (geografi, bransch, "
        "senioritet etc.) och kollapsa dem till 1–2 påståenden som:\n"
        "  - Är audience-relevanta (givet personerna i kontexten nedan)\n"
        "  - Behåller informationsvärdet utan att lista varje datapunkt\n"
        "  - Är skrivna som naturligt språk, inte rådata\n"
        "  - Lyfter social-proof-aspekten där den är stark (t.ex. seniora beslutsfattare, "
        "nyckelfunktioner), nedtonar små obetydliga siffror\n\n"
        f"Max {MAX_NARRATIVE_WORDS} ord per narrative. Skriv på svenska.\n"
        'Returnera ENDAST JSON: {"narratives": ["...", "..."]}. Inga andra fält.'
    )


def _build_user_prompt(
    statements: list[str],
    audience_priorities: list[AudiencePriority],
    company_name: str | None,
) -> str:
    parts: list[str] = [f"Bolag: {company_name or '(okänt)'}"]
    if audience_priorities:
        parts.append("\nAudience-prioriteringar:")
        for a in audience_priorities:
            personas = "; ".join(_format_persona(p) for p in a.personas) or "(inga)"
            axes = "; ".join(a.narrative_axes) or "(inga)"
            parts.append(f"- {a.audience_type} (vikt {a.weight}): personas=[{personas}] axlar=[{axes}]")
    else:
        parts.append("\nIngen audience-prioritering — syntetisera konservativt.")

    parts.append(f"\nAtomära claims att syntetisera ({len(statements)} st):")
    for i, s in enumerate(statements, 1):
        if s:
            parts.append(f"{i}. {s}")
    parts.append("\nSyntetisera till max 2 narratives.")
    return "\n".join(parts)


def _format_persona(p: PersonaTarget) -> str:
    bits = [p.role]
    if p.industry:
        bits.append(p.industry)
    if p.company_size:
        bits.append(p.company_size)
    return " / ".join(bits)


# --- Persistering ------------------------------------------------------------


def _persist_aggregation(
    client_id: str,
    narratives: list[str],
    originals: list[tuple[str, dict[str, Any]]],
    dimension_hint: str | None,
) -> list[str]:
    """Skapa nya narrative-claims, deaktivera originalen."""
    new_ids: list[str] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    # Härled en attested-källa: färskast attested_at av originalen + samlad label
    aggregated_source = _build_aggregated_source(originals)

    for n in narratives:
        cid = _build_aggregated_id(n, [c for c, _ in originals])
        doc = {
            "claim_kind": "narrative",
            "subject_ref": "org",
            "statement": n,
            "source": [aggregated_source],
            "confidence": 1.0,
            "included_in_output": True,
            "needs_review": False,
            "review_status": "approved",
            "facet": "operational",
            "validated_at": now_iso,
            "validated_by": "aggregation (rubric-synthesis)",
            "origin": f"aggregated:{dimension_hint or 'mixed'}",
            "aggregated_from": [c for c, _ in originals],
            "created_at": now_iso,
        }
        fs.claim_doc(client_id, cid).set(doc)
        new_ids.append(cid)

    # Markera originalen som aggregerade — bevaras som evidens men inte i output
    for cid, _ in originals:
        fs.claim_doc(client_id, cid).update({
            "included_in_output": False,
            "needs_review": False,
            "review_status": "aggregated",
            "aggregated_into": new_ids,
            "aggregated_at": now_iso,
        })

    # Affärshändelse → kund-tidslinjen
    try:
        from jobs._run_tracker import log_event
        log_event(
            "claims_aggregated",
            client_id,
            {
                "dimension_hint": dimension_hint,
                "originals_count": len(originals),
                "new_claim_ids": new_ids,
                "new_narratives": [n[:200] for n in narratives],
            },
        )
    except Exception:  # noqa: BLE001
        log.exception("kunde inte logga claims_aggregated-event")

    return new_ids


def _build_aggregated_source(originals: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    """Färskast attested-källa från originalen + tydlig label.

    Fallback: om originalen saknar attested-källor (t.ex. extraction-claims) bygger
    vi en manual-källa istället. Det här är "good enough" för MVP — full source-fan-out
    skulle göra grafens källa-numrering svår."""
    best_attested: dict[str, Any] | None = None
    best_attested_at = ""
    for _, raw in originals:
        for src in raw.get("source") or []:
            if src.get("kind") == "attested":
                at = src.get("attested_at") or ""
                if at > best_attested_at:
                    best_attested = src
                    best_attested_at = at
    if best_attested is not None:
        label = best_attested.get("label") or "verifierad av Geogiraph"
        return {
            "kind": "attested",
            "label": f"Sammanfattning av {len(originals)} datapunkter — {label}",
            "attested_at": best_attested_at,
            "url": best_attested.get("url"),
        }
    return {
        "kind": "manual",
        "label": f"Sammanfattning av {len(originals)} datapunkter",
    }


def _build_aggregated_id(narrative: str, original_ids: list[str]) -> str:
    """Stabilt id så omkörning skriver över istället för att duplicera."""
    digest = hashlib.sha1(
        (narrative + "|" + "|".join(sorted(original_ids))).encode("utf-8")
    ).hexdigest()[:14]
    return f"agg-{digest}"
