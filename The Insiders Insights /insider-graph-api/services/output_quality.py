"""Output-kvalitets-rubric: scorar en bundle av claims innan publicering.

Ren funktion (`score_bundle`) — inga DB-skrivningar, inga sideffekter. Designad
för att köras i shadow mode på alla leveranser och som gate på utvalda connectors
(MVP: LinkedIn-demografi).

**Två lager scoring:**

1.  LLM-pass: en validator-modell (Vertex AI EU, gemini-2.5-pro) klassificerar
    varje claim på `dimension_hint` + `best_audience`, poängsätter 0–5 på sex
    dimensioner, och föreslår action (publish / transform / drop).
2.  Deterministisk efterhandskontroll: bundle-nivå-flaggor (redundans per
    dimension, persona-täckning, volymtak) räknas ut ur LLM-resultatet.

**Trösklar (vecka 1–2, mjuk start):** se [[feedback_demographics_are_social_proof]]
och designdiskussionen — endast hårda objektiva fel blockerar dag 1, allt annat
hamnar i needs_review eller publiceras. Trösklarna är medvetet provisoriska och
ska kalibreras mot perception-loopen ([[project_ai_visibility_loop_automated]])
när vi har 4+ veckors data.

**EU-only:** LLM-anropet går via `services.llm.make_validator()` som returnerar
None om `settings.gcp_project` saknas. I så fall returneras `verdict="pass"` med
`metadata.llm_unavailable=true` — bättre att leverera än att blockera vid LLM-fel.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from services import audience_personas
from services.llm import invoke_json, make_validator

log = logging.getLogger(__name__)


# --- Trösklar & konstanter (vecka 1–2; flyttas till verification_profiles-mönster om vi får fler) ---

SCORE_DIMENSIONS = (
    "persona_citerbarhet",  # skulle målpersonan citera detta?
    "sjalvbarighet",         # står claimet på egna ben (eller saknar kontext)?
    "paastaaende_vs_stat",   # claim eller rådata?
    "berattelse_fit",        # förstärker det en berättelseaxel?
    "evidence_styrka",       # finns spårbar källa?
    "schema_passform",       # rätt JSON-LD-slot?
)

CLAIM_DROP_BELOW = 1.5             # snitt < 1.5 → drop
CLAIM_TRANSFORM_BELOW = 2.5        # 1.5–2.5 → transform
BUNDLE_NEEDS_REVIEW_BELOW = 3.0    # bundle-snitt under detta → needs_review
MAX_PER_DIMENSION_HINT = 3         # >3 claims med samma dimension_hint = redundant
SOFT_VOLUME_CAP = 15               # mjuk gräns; över = flagga, inte block
LLM_BATCH_HARD_CAP = 80            # över detta skickar vi i flera batchar

AUDIENCE_TYPES = audience_personas.CANONICAL  # customer / employee / investor


# --- Models: input ---


class PersonaTarget(BaseModel):
    """En målpersona inom en audience-typ."""

    role: str
    industry: str | None = None
    company_size: str | None = None
    description: str | None = None


class AudiencePriority(BaseModel):
    """Per audience-typ: vikt + personor + berättelseaxlar.

    `weight` är relativ — normaliseras vid scoring så summan blir 1.0.
    Audiences som saknas eller har weight=0 betyder att kunden inte
    prioriterar dem (se [[project_icp_multi_audience]])."""

    audience_type: Literal["customer", "employee", "investor"]
    weight: float = Field(default=1.0, ge=0.0)
    personas: list[PersonaTarget] = Field(default_factory=list)
    narrative_axes: list[str] = Field(default_factory=list)

    @field_validator("audience_type", mode="before")
    @classmethod
    def _normalize_audience(cls, v: object) -> object:
        # Gammalt id (candidate) → kanoniskt (employee), före Literal-validering.
        # Täcker både inkommande API-anrop och lagrad client.audience_priorities.
        return audience_personas.normalize(v) if isinstance(v, str) else v


class RubricClaim(BaseModel):
    """Slim subset av Claim som rubric:en behöver. Caller adapterar från Claim.

    Vi tar inte hela Claim-modellen som input för att (a) hålla payloaden liten,
    (b) tvinga callern att vara explicit med fält som inte finns på Claim
    (connector, schema_slot) och (c) inte koppla rubric-API:t till framtida
    Claim-modellförändringar."""

    claim_id: str | None = None
    statement: str | None = None
    predicate: str | None = None
    value: Any | None = None
    claim_kind: Literal["property", "narrative"] = "narrative"
    facet: Literal["operational", "culture"] = "operational"
    # Vilken connector producerade claimet — driver per-connector aggregering i steg 5.
    connector: str | None = None
    # Vilken JSON-LD-slot/profilsidsfält claimet ska in i (description, additionalProperty, …).
    schema_slot: str | None = None
    # Har claimet minst en källa? Förenklat boolean så callern slipper skicka hela ClaimSource[].
    has_source: bool = True


class RubricRequest(BaseModel):
    client_id: str | None = None
    company_name: str | None = None
    audience_priorities: list[AudiencePriority] = Field(default_factory=list)
    claims: list[RubricClaim]


# --- Models: output ---


class ClaimScore(BaseModel):
    claim_id: str | None = None
    statement_preview: str
    score: float                 # snitt över SCORE_DIMENSIONS
    dimensions: dict[str, float] # per-dimension 0–5
    dimension_hint: str | None = None  # geography / industry / seniority / …
    best_audience: str | None = None   # customer / candidate / investor / none
    action: Literal["publish", "transform", "drop"]
    reasons: list[str] = Field(default_factory=list)
    suggestion: str | None = None      # om action="transform"


class BundleFlag(BaseModel):
    """En bundle-nivå-observation. `type` styr UI-rendering i granskningskön."""

    type: Literal[
        "high_redundancy",        # >MAX_PER_DIMENSION_HINT claims i samma dimension_hint
        "missing_persona",        # en prioriterad audience har 0 starka claims
        "low_authority_density",  # snittpoäng < BUNDLE_NEEDS_REVIEW_BELOW
        "volume_too_high",        # >SOFT_VOLUME_CAP claims totalt
        "no_audience_target",     # ingen audience_priorities angiven
        "schema_slot_mismatch",   # claim hamnar i fel JSON-LD-slot
    ]
    detail: str | None = None
    dimension_hint: str | None = None
    audience: str | None = None


class RubricResponse(BaseModel):
    bundle_score: float
    verdict: Literal["pass", "needs_review", "block"]
    per_claim: list[ClaimScore]
    bundle_flags: list[BundleFlag] = Field(default_factory=list)
    top_improvements: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


# --- Kärnfunktion ---


def score_bundle(request: RubricRequest) -> RubricResponse:
    """Scorar en bundle av claims och returnerar verdict + per-claim-detaljer.

    Ren funktion: ingen DB-läsning, inga skrivningar, ingen logging utöver
    debug. Callers ansvar att persistera resultatet om det behövs."""
    metadata: dict[str, Any] = {"claim_count": len(request.claims)}

    # Tom bundle = pass trivialt (inget att granska, inget att flagga).
    if not request.claims:
        return RubricResponse(
            bundle_score=0.0,
            verdict="pass",
            per_claim=[],
            bundle_flags=[],
            metadata={**metadata, "empty_bundle": True},
        )

    # LLM-pass: scorea varje claim. Vid LLM-fel → shadow-friendly default.
    llm_items = _score_claims_with_llm(
        request.claims, request.audience_priorities, request.company_name
    )
    if llm_items is None:
        return _llm_unavailable_response(request.claims, metadata)
    metadata["llm_unavailable"] = False

    per_claim = [_build_claim_score(claim, item) for claim, item in zip(request.claims, llm_items)]

    bundle_flags = _compute_bundle_flags(request, per_claim)
    bundle_score = _compute_bundle_score(per_claim)
    verdict = _determine_verdict(bundle_score, bundle_flags)
    top_improvements = _build_top_improvements(per_claim, bundle_flags)

    return RubricResponse(
        bundle_score=bundle_score,
        verdict=verdict,
        per_claim=per_claim,
        bundle_flags=bundle_flags,
        top_improvements=top_improvements,
        metadata=metadata,
    )


# --- Steg 1: LLM-pass ---


def _score_claims_with_llm(
    claims: list[RubricClaim],
    audience_priorities: list[AudiencePriority],
    company_name: str | None,
) -> list[dict[str, Any]] | None:
    """Anropar validator-LLM:n för per-claim-scoring. None om LLM ej tillgänglig
    eller om svaret är trasigt. Söm för test-mockning."""
    llm = make_validator()
    if llm is None:
        return None

    system = _build_system_prompt()
    user = _build_user_prompt(claims, audience_priorities, company_name)
    raw = invoke_json(llm, system, user)
    if not raw or "items" not in raw:
        log.warning("rubric LLM returned no usable items")
        return None

    items = raw.get("items") or []
    if len(items) != len(claims):
        log.warning("rubric LLM returned %d items for %d claims", len(items), len(claims))
        return None
    return items


def _build_system_prompt() -> str:
    dimensions_desc = "\n".join(
        f"  - {d}: 0–5 (5 = bäst)" for d in SCORE_DIMENSIONS
    )
    return (
        "Du är en kvalitetsdomare för 'claims' (faktauttalanden) som ska publiceras i "
        "JSON-LD och på en profilsida om ett bolag. För varje claim ska du:\n\n"
        "1. Klassificera dimension_hint som en av: geography, industry, seniority, "
        "function, company_size, certification, customer_logo, culture, financial, "
        "narrative, other.\n"
        "2. Identifiera best_audience: customer / employee / investor / none. Det är "
        "den audience-typ som claimet bäst landar hos givet bolagets prioriteringar.\n"
        "3. Poängsätt på sex dimensioner (0–5):\n"
        f"{dimensions_desc}\n"
        "   - persona_citerbarhet: skulle någon i målgruppens persona få det här som "
        "svar på en relevant fråga från en AI-motor?\n"
        "   - sjalvbarighet: står claimet på egna ben (totalt/kontext finns)?\n"
        "   - paastaaende_vs_stat: är det ett SYNTETISERAT påstående eller bara rådata?\n"
        "   - berattelse_fit: förstärker det någon av bolagets berättelseaxlar?\n"
        "   - evidence_styrka: 5 om has_source=true, annars 0–2.\n"
        "   - schema_passform: hör claimet hemma i den JSON-LD-slot det hamnar i?\n"
        "4. Föreslå action: publish (≥2.5 snitt) / transform (1.5–2.5) / drop (<1.5).\n"
        "5. Om transform: skissa en bättre formulering, max 25 ord, på svenska.\n\n"
        "Returnera ENDAST ett JSON-objekt på formen: "
        '{"items": [{"index": 0, "dimension_hint": "...", "best_audience": "...", '
        '"dimensions": {...}, "action": "...", "reasons": ["..."], "suggestion": "..."}]}. '
        "Items MÅSTE returneras i samma ordning som claims i input."
    )


def _build_user_prompt(
    claims: list[RubricClaim],
    audience_priorities: list[AudiencePriority],
    company_name: str | None,
) -> str:
    parts: list[str] = []
    parts.append(f"Bolag: {company_name or '(okänt)'}")
    if audience_priorities:
        parts.append("\nAudience-prioriteringar (viktade):")
        for a in audience_priorities:
            personas = "; ".join(
                _format_persona(p) for p in a.personas
            ) or "(inga definierade)"
            axes = "; ".join(a.narrative_axes) or "(inga)"
            parts.append(
                f"- {a.audience_type} (weight={a.weight}): personas=[{personas}] "
                f"berättelseaxlar=[{axes}]"
            )
    else:
        parts.append("\nIngen audience_priorities angiven — scorea konservativt.")

    parts.append("\nCLAIMS (indexerade i input-ordning):")
    for i, c in enumerate(claims):
        text = c.statement or _format_property(c)
        slot = c.schema_slot or "(okänd slot)"
        src = "källa: ja" if c.has_source else "källa: nej"
        connector = f", connector: {c.connector}" if c.connector else ""
        parts.append(f"[{i}] \"{text}\" (slot: {slot}, {src}{connector})")
    return "\n".join(parts)


def _format_persona(p: PersonaTarget) -> str:
    bits = [p.role]
    if p.industry:
        bits.append(p.industry)
    if p.company_size:
        bits.append(p.company_size)
    return " / ".join(bits)


def _format_property(c: RubricClaim) -> str:
    if c.predicate and c.value is not None:
        return f"{c.predicate} = {c.value}"
    if c.predicate:
        return c.predicate
    return "(tomt claim)"


# --- Steg 2: bygg ClaimScore ur LLM-svar ---


def _build_claim_score(claim: RubricClaim, item: dict[str, Any]) -> ClaimScore:
    dims = item.get("dimensions") or {}
    cleaned = {d: _clamp(dims.get(d, 0)) for d in SCORE_DIMENSIONS}
    score = sum(cleaned.values()) / len(cleaned)
    action = _resolve_action(item.get("action"), score)

    preview = (claim.statement or _format_property(claim) or "").strip()
    if len(preview) > 120:
        preview = preview[:117] + "…"

    return ClaimScore(
        claim_id=claim.claim_id,
        statement_preview=preview,
        score=round(score, 2),
        dimensions=cleaned,
        dimension_hint=item.get("dimension_hint"),
        # Normalisera ev. gammalt audience-id (candidate) → kanoniskt (employee).
        best_audience=audience_personas.normalize(item.get("best_audience")),
        action=action,
        reasons=list(item.get("reasons") or []),
        suggestion=item.get("suggestion"),
    )


def _clamp(v: Any) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(5.0, f))


def _resolve_action(raw: Any, score: float) -> Literal["publish", "transform", "drop"]:
    """Föredra LLM:ens action om den är giltig, annars härled ur snittet."""
    if raw in ("publish", "transform", "drop"):
        return raw
    if score < CLAIM_DROP_BELOW:
        return "drop"
    if score < CLAIM_TRANSFORM_BELOW:
        return "transform"
    return "publish"


# --- Steg 3: bundle-nivå-aggregeringar ---


def _compute_bundle_flags(
    request: RubricRequest, per_claim: list[ClaimScore]
) -> list[BundleFlag]:
    flags: list[BundleFlag] = []

    # Ingen audience_priorities → flagga (men blockera inte).
    prioritized_types = [
        a.audience_type for a in request.audience_priorities if a.weight > 0
    ]
    if not prioritized_types:
        flags.append(BundleFlag(
            type="no_audience_target",
            detail="Ingen audience_priorities angiven — persona-scoring konservativ",
        ))

    # Volymtak.
    if len(per_claim) > SOFT_VOLUME_CAP:
        flags.append(BundleFlag(
            type="volume_too_high",
            detail=f"{len(per_claim)} claims (mjuk gräns {SOFT_VOLUME_CAP})",
        ))

    # Redundans per dimension_hint.
    hint_counts = Counter(c.dimension_hint for c in per_claim if c.dimension_hint)
    for hint, count in hint_counts.items():
        if count > MAX_PER_DIMENSION_HINT:
            flags.append(BundleFlag(
                type="high_redundancy",
                dimension_hint=hint,
                detail=f"{count} claims i dimensionen '{hint}' (tak {MAX_PER_DIMENSION_HINT})",
            ))

    # Persona-täckning: varje prioriterad audience behöver minst ett claim
    # med score >= CLAIM_TRANSFORM_BELOW och best_audience == typen.
    strong_audiences = {
        c.best_audience for c in per_claim
        if c.score >= CLAIM_TRANSFORM_BELOW and c.best_audience
    }
    for audience in prioritized_types:
        if audience not in strong_audiences:
            flags.append(BundleFlag(
                type="missing_persona",
                audience=audience,
                detail=f"Ingen starkt claim landar hos audience '{audience}'",
            ))

    # Schema-passform: claims som LLM:en gett schema_passform < 2 räknas
    # som slot-mismatch-flaggor på bundle-nivå.
    mismatches = [
        c for c in per_claim if c.dimensions.get("schema_passform", 5) < 2
    ]
    if mismatches:
        flags.append(BundleFlag(
            type="schema_slot_mismatch",
            detail=f"{len(mismatches)} claims i fel slot",
        ))

    # Authority density flaggas också separat så UI kan särskilja "låg snittpoäng"
    # från andra problem.
    avg = _compute_bundle_score(per_claim)
    if avg < BUNDLE_NEEDS_REVIEW_BELOW:
        flags.append(BundleFlag(
            type="low_authority_density",
            detail=f"snittpoäng {avg:.2f} < {BUNDLE_NEEDS_REVIEW_BELOW}",
        ))

    return flags


def _compute_bundle_score(per_claim: list[ClaimScore]) -> float:
    if not per_claim:
        return 0.0
    return round(sum(c.score for c in per_claim) / len(per_claim), 2)


def _determine_verdict(
    bundle_score: float, bundle_flags: list[BundleFlag]
) -> Literal["pass", "needs_review", "block"]:
    """Vecka 1–2: ingenting blockerar leveransen — bara needs_review eller pass.

    Tidigare blockerade schema_slot_mismatch, men aggregations-narratives har visat
    sig få sporadiskt låg `schema_passform`-score från LLM:en utan att det är ett
    verkligt fel. Tröskeln var för aggressiv. Flaggan finns kvar i bundle_flags för
    granskning men driver inte längre block-verdict. Block kan återinföras när vi
    har kalibrerat LLM:ens schema-passform-score mot perception-utfall."""
    if bundle_score < BUNDLE_NEEDS_REVIEW_BELOW:
        return "needs_review"
    if any(
        f.type in ("high_redundancy", "missing_persona", "volume_too_high", "schema_slot_mismatch")
        for f in bundle_flags
    ):
        return "needs_review"
    return "pass"


def _build_top_improvements(
    per_claim: list[ClaimScore], bundle_flags: list[BundleFlag]
) -> list[str]:
    """Topp-3 förslag som täcker både bundle-flaggor och svagaste claims."""
    suggestions: list[str] = []
    for flag in bundle_flags:
        if flag.type == "high_redundancy":
            suggestions.append(
                f"Aggregera de {flag.detail or ''} — använd 1–2 syntetiserade claims istället för en lista."
            )
        elif flag.type == "missing_persona":
            suggestions.append(
                f"Lyft fram ett claim som landar hos '{flag.audience}' — den prioriteras men saknar starkt påstående."
            )
        elif flag.type == "volume_too_high":
            suggestions.append(
                f"Minska volymen — {flag.detail}. Prioritera de mest citerbara."
            )

    # Komplettera med claim-specifika förslag (transform/drop) från lägst snitt.
    weakest = sorted(per_claim, key=lambda c: c.score)[:5]
    for c in weakest:
        if c.suggestion and c.action in ("transform", "drop"):
            suggestions.append(c.suggestion)
        if len(suggestions) >= 3:
            break

    return suggestions[:3]


# --- LLM-otillgänglig: shadow-friendly fallback ---


def _llm_unavailable_response(
    claims: list[RubricClaim], metadata: dict[str, Any]
) -> RubricResponse:
    """När validator-LLM:n inte är tillgänglig vill vi inte blockera leverans.
    Returnerar pass-verdict med tydlig metadata-flagga så shadow-loggen kan filtrera."""
    placeholder = [
        ClaimScore(
            claim_id=c.claim_id,
            statement_preview=(c.statement or _format_property(c))[:120],
            score=0.0,
            dimensions={d: 0.0 for d in SCORE_DIMENSIONS},
            action="publish",
            reasons=["llm_unavailable"],
        )
        for c in claims
    ]
    return RubricResponse(
        bundle_score=0.0,
        verdict="pass",
        per_claim=placeholder,
        bundle_flags=[],
        top_improvements=[],
        metadata={**metadata, "llm_unavailable": True},
    )
