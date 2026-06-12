"""Alignment-audit: svarar profilsidan på det probe-frågorna faktiskt frågar?

Bakgrund (deep research 2026-06-11): den största ENSKILDA ociterings-orsaken är
semantisk feljustering mot riktiga frågor (~62 % av fallen, AgentGEO), inte
innehållskvalitet eller markup. Riktade reparationer som rör ~5 % av innehållet
slår generisk omskrivning. Vår unika ingrediens: probe-loopens persona-batterier
ÄR de riktiga frågor motorerna får om kunden (services/persona_registry).

Den här modulen sluter loopen **probe → gap → riktad sidreparation**:

  1. Räkna upp probe-frågorna för kundens AKTIVA personor (default
     buyer/candidate/investor = customer/talent/investor) × 6 värmedimensioner,
     i båda vinklarna (Spår A = neutral, Spår B = adversariell).
  2. För varje (persona × dimension) avgör en matcher om profilsidans faktiska
     textinnehåll (samma render-modell som crawlers läser) innehåller ett
     EXTRAHERBART svar — inte bara nämner ämnet.
  3. Varje gap blir en `ClaimOrder` — en riktad beställning av ETT nytt
     källbart culture-claim (dimension + audience satt), inte en omskrivning.

Designval (faithful mot warmth_probes):
- Vi poolar Spår A + Spår B till EN täckningsbedömning per (persona × dimension),
  precis som `_judge_verdict` poolar båda svaren till en verdict. Båda vinklarna
  ges till matchern som kontext; den neutrala bär informationsbehovet, den
  adversariella prövar om sidan föregriper oron.
- Matchern är INJICERBAR (prod = LLM via llm.invoke_json; test = fake), samma
  mönster som probe-domaren. Ingen domarmodell → audit hoppas över (None).

Kostnad: aktiv-cap är 5 personor → ≤ 5 × 6 = 30 matcher-anrop per audit.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import firestore_client as fs
from schema_org import humanization_config as hc
from schemas import Claim, ClaimSource
from schema_org import i18n
from schema_org.compiler import RenderModel, build_faq, build_render_model
from services import persona_derivation, persona_registry

log = logging.getLogger(__name__)

# Spår-etiketter (warmth_probes-konventionen): neutral = Spår A, adversariell = Spår B.
ANGLE_NEUTRAL = "neutral"
ANGLE_ADVERSARIAL = "adversarial"


@dataclass(frozen=True)
class ProbeBattery:
    """Probe-paret för EN (persona × dimension) — båda vinklarna (Spår A + B)."""

    persona_id: str
    dimension: str
    neutral_q: str       # Spår A — informationsbehovet, {company}-substituerat
    adversarial_q: str   # Spår B — den kritiska vinkeln, {company}-substituerat

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AlignmentResult:
    """Täckningsbedömning för en battery: svarar sidan på frågan?"""

    persona_id: str
    dimension: str
    dimension_label: str
    neutral_q: str
    adversarial_q: str
    covered: bool
    evidence: Optional[str]   # ordagrann mening ur sidan som svarar, annars None
    confidence: float         # matcherns säkerhet 0–1
    reason: str               # kort motivering

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ClaimOrder:
    """Riktad beställning av ETT nytt källbart claim som stänger ett gap.

    Inte en omskrivning — en konkret assertion bolaget kan belägga. Mappar rakt
    mot culture-claim-modellen (facet='culture', dimension satt, audience=persona)
    så ops kan beställa/verifiera den genom befintlig claim-väg."""

    persona_id: str
    dimension: str
    dimension_label: str
    facet: str                # alltid "culture" — värmedimensioner
    audience: list[str]       # [persona_id] — claimet är riktat
    suggested_statement: str  # utkast: kort, konkret, belägg-bart svar på frågan
    probe_neutral_q: str      # frågan gapet kom ur (Spår A)
    probe_adversarial_q: str  # Spår B
    rationale: str            # varför sidan inte svarar idag

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AlignmentAudit:
    client_id: str
    company_name: str
    language: str
    results: list[AlignmentResult]
    gaps: list[AlignmentResult]        # delmängd: covered=False
    claim_orders: list[ClaimOrder]
    coverage: dict[str, Any]           # summering (overall + per persona/dimension)
    active_personas: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "client_id": self.client_id,
            "company_name": self.company_name,
            "language": self.language,
            "active_personas": self.active_personas,
            "results": [r.as_dict() for r in self.results],
            "gaps": [g.as_dict() for g in self.gaps],
            "claim_orders": [c.as_dict() for c in self.claim_orders],
            "coverage": self.coverage,
        }


# En Matcher avgör om sidan svarar på en battery. Injicerbar (prod=LLM, test=fake).
# Returnerar None vid fel (behandlas konservativt som "ej täckt" så vi inte missar
# ett gap p.g.a. ett LLM-avbrott).
Matcher = Callable[[ProbeBattery, str, str], Optional[dict]]


_MATCH_SYSTEM = (
    "Du avgör om en företagsprofil-sida innehåller ett EXTRAHERBART svar på en fråga "
    "som en AI-motor (ChatGPT/Perplexity) kan få om bolaget. Du får företagsnamn, två "
    "framställningar av samma underliggande fråga (neutral + kritisk vinkel), vilken "
    "dimension det gäller, samt sidans HELA textinnehåll. "
    'Returnera ENDAST JSON: {"covered": <true|false>, "evidence": <ordagrann mening ur '
    'sidan som svarar, annars null>, "confidence": <0-1>, "reason": <kort motivering>, '
    '"suggested_answer": <om covered=false: ETT kort, konkret påstående bolaget skulle '
    'kunna belägga som direkt svarar på frågan; annars null>}. '
    "covered=true ENDAST om sidan har konkret, citerbar information som FAKTISKT svarar "
    "på frågan — inte bara nämner ämnet. Generella floskler räcker inte. suggested_answer "
    "ska vara en specifik assertion (t.ex. 'X erbjuder 6 månaders föräldralön utöver lag'), "
    "inte en uppmaning att skriva mer. "
    "VIKTIGT om suggested_answer: den ska handla om EXAKT det bolag som anges i 'företag' "
    "och svara på JUST den ställda frågans ämne (dimensionen). Hitta ALDRIG på andra bolags "
    "namn, siffror, mål eller policyer, och blanda inte in en annan dimension. Om du inte kan "
    "formulera ett trovärdigt, ämnesrätt påstående grundat i det angivna bolaget — returnera "
    "null i stället för att gissa."
)


def llm_matcher(llm: Any) -> Matcher:
    """Produktionsmatcher: en LLM bedömer täckning per battery via llm.invoke_json."""
    from services import llm as llm_service

    def _match(battery: ProbeBattery, page_content: str, company: str) -> Optional[dict]:
        payload = {
            "företag": company,
            "dimension": hc.DIMENSIONS.get(battery.dimension, battery.dimension),
            "neutral_fråga": battery.neutral_q,
            "kritisk_fråga": battery.adversarial_q,
            "sidinnehåll": page_content,
        }
        return llm_service.invoke_json(
            llm, _MATCH_SYSTEM, json.dumps(payload, ensure_ascii=False)
        )

    return _match


def _value_text(value: Any) -> str:
    return ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)


def build_page_content(model: RenderModel) -> str:
    """Sidans faktiska textinnehåll — det en crawler extraherar (lead, fakta,
    prosa, FAQ). Samma render-modell som HTML/llms.txt, så auditen mäter det
    motorerna verkligen ser, inte en parallell representation."""
    loc = i18n.strings(model.language)
    parts: list[str] = []
    if model.lead:
        parts.append(model.lead)
    if model.description and model.description != model.lead:
        parts.append(model.description)
    for f in model.facts:
        label = loc["fact_labels"].get(f.predicate, f.predicate)
        parts.append(f"{label}: {_value_text(f.value)}")
    for p in model.prose:
        parts.append(p.statement)
    for e in build_faq(model):
        parts.append(f"{e.question} {e.answer}")
    return "\n".join(parts)


def build_batteries(active_persona_ids: list[str], company: str) -> list[ProbeBattery]:
    """Räkna upp probe-batterierna (persona × dimension, Spår A + B) för aktiva
    personor, med {company} substituerat. Registry-ordning för stabil rendering."""
    batteries: list[ProbeBattery] = []
    for pid in active_persona_ids:
        if not persona_registry.is_valid(pid):
            continue
        persona = persona_registry.get(pid)
        for dim, (neutral_q, adversarial_q) in persona.probe_templates.items():
            batteries.append(
                ProbeBattery(
                    persona_id=pid,
                    dimension=dim,
                    neutral_q=neutral_q.format(company=company),
                    adversarial_q=adversarial_q.format(company=company),
                )
            )
    return batteries


def _result_from_verdict(battery: ProbeBattery, verdict: Optional[dict]) -> AlignmentResult:
    dim_label = hc.DIMENSIONS.get(battery.dimension, battery.dimension)
    # Konservativt: matcher-fel (None) → ej täckt, confidence 0. Vi hellre reser ett
    # falskt gap (ops avfärdar) än missar ett verkligt p.g.a. LLM-avbrott.
    covered = bool(verdict and verdict.get("covered") is True)
    evidence = (verdict or {}).get("evidence") if covered else None
    confidence = _clamp((verdict or {}).get("confidence"))
    reason = str((verdict or {}).get("reason") or ("matcher otillgänglig" if verdict is None else ""))
    return AlignmentResult(
        persona_id=battery.persona_id,
        dimension=battery.dimension,
        dimension_label=dim_label,
        neutral_q=battery.neutral_q,
        adversarial_q=battery.adversarial_q,
        covered=covered,
        evidence=evidence if isinstance(evidence, str) else None,
        confidence=confidence,
        reason=reason,
    )


def _claim_order(battery: ProbeBattery, verdict: Optional[dict]) -> ClaimOrder:
    dim_label = hc.DIMENSIONS.get(battery.dimension, battery.dimension)
    suggested = (verdict or {}).get("suggested_answer")
    if not isinstance(suggested, str) or not suggested.strip():
        # Fallback-utkast när matchern inte gav ett förslag: en neutral platshållare
        # som pekar ut informationsbehovet (ops formulerar och belägger).
        suggested = f"[Att belägga] Konkret påstående om {dim_label} riktat till {battery.persona_id}."
    reason = str((verdict or {}).get("reason") or "Sidan saknar extraherbart svar på frågan.")
    return ClaimOrder(
        persona_id=battery.persona_id,
        dimension=battery.dimension,
        dimension_label=dim_label,
        facet="culture",
        audience=[battery.persona_id],
        suggested_statement=suggested.strip(),
        probe_neutral_q=battery.neutral_q,
        probe_adversarial_q=battery.adversarial_q,
        rationale=reason,
    )


def _clamp(v: Any) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.0


def _coverage_summary(results: list[AlignmentResult]) -> dict[str, Any]:
    total = len(results)
    covered = sum(1 for r in results if r.covered)

    def _pct(num: int, den: int) -> float:
        return round(num / den, 3) if den else 0.0

    by_persona: dict[str, dict[str, Any]] = {}
    by_dimension: dict[str, dict[str, Any]] = {}
    for r in results:
        for bucket, key in ((by_persona, r.persona_id), (by_dimension, r.dimension)):
            slot = bucket.setdefault(key, {"covered": 0, "total": 0})
            slot["total"] += 1
            if r.covered:
                slot["covered"] += 1
    for bucket in (by_persona, by_dimension):
        for slot in bucket.values():
            slot["coverage"] = _pct(slot["covered"], slot["total"])
    return {
        "total": total,
        "covered": covered,
        "gaps": total - covered,
        "coverage": _pct(covered, total),
        "by_persona": by_persona,
        "by_dimension": by_dimension,
    }


def run_alignment_audit(
    client_id: str,
    *,
    matcher: Matcher | None = None,
    model: RenderModel | None = None,
    active_persona_ids: list[str] | None = None,
) -> AlignmentAudit | None:
    """Kör alignment-auditen för en kund och returnera gap + claim-beställningar.

    No-op (None) om ingen matcher kan byggas (ingen domarmodell) — samma kontrakt
    som warmth_probes. `matcher`/`model`/`active_persona_ids` är injicerbara för test.
    """
    model = model if model is not None else build_render_model(client_id)
    company = model.company_name or model.client_id

    if matcher is None:
        from services import llm as llm_factory

        judge = llm_factory.make_validator()
        if judge is None:
            log.warning("alignment-audit: ingen domarmodell — hoppar över %s", client_id)
            return None
        matcher = llm_matcher(judge)

    if active_persona_ids is None:
        active_persona_ids = persona_derivation.get_active_personas(client_id)

    page_content = build_page_content(model)
    batteries = build_batteries(active_persona_ids, company)

    results: list[AlignmentResult] = []
    claim_orders: list[ClaimOrder] = []
    for battery in batteries:
        try:
            verdict = matcher(battery, page_content, company)
        except Exception as exc:  # noqa: BLE001 — en battery får inte fälla hela auditen
            log.warning("alignment-matcher föll för %s/%s: %s", battery.persona_id, battery.dimension, exc)
            verdict = None
        result = _result_from_verdict(battery, verdict)
        results.append(result)
        if not result.covered:
            claim_orders.append(_claim_order(battery, verdict))

    gaps = [r for r in results if not r.covered]
    return AlignmentAudit(
        client_id=client_id,
        company_name=company,
        language=model.language,
        results=results,
        gaps=gaps,
        claim_orders=claim_orders,
        coverage=_coverage_summary(results),
        active_personas=list(active_persona_ids),
    )


def run_and_store(
    client_id: str,
    *,
    matcher: Matcher | None = None,
    model: RenderModel | None = None,
    active_persona_ids: list[str] | None = None,
    store: Callable[[str, dict], None] | None = None,
) -> dict[str, Any] | None:
    """Kör auditen och persistera senaste resultatet (gap + claim-orders) till
    polling_results/alignment-latest, så ops kan läsa det. Speglar warmth_probes
    run_for_client: tjänstelagret äger persistensen, jobbet anropar bara hit.

    Vi persisterar BARA resultat-dokumentet — claim-orders blir INTE automatiskt
    claims (medvetet ops-beslut: hellre en kö ops väljer ur än ~30 obelagda LLM-
    förslag/kund rakt in i granskningskön). No-op (None) om auditen hoppas över
    (ingen domarmodell). `store` är injicerbar för test.
    """
    audit = run_alignment_audit(
        client_id, matcher=matcher, model=model, active_persona_ids=active_persona_ids
    )
    if audit is None:
        return None
    doc = audit.as_dict()
    doc["captured_at"] = datetime.now(timezone.utc).isoformat()
    if store is not None:
        store(client_id, doc)
    else:
        fs.polling_results_col(client_id).document(hc.ALIGNMENT_AUDIT_DOC).set(doc)
    log.info(
        "alignment-audit skriven för %s: %d gap av %d batterier",
        client_id, doc["coverage"]["gaps"], doc["coverage"]["total"],
    )
    return doc


def read_latest(client_id: str) -> dict[str, Any] | None:
    """Senaste persisterade auditen för en kund (polling_results/alignment-latest),
    eller None om den aldrig körts. Läsvägen för ops-ytan + claim-order-åtgärden."""
    snap = fs.polling_results_col(client_id).document(hc.ALIGNMENT_AUDIT_DOC).get()
    if not getattr(snap, "exists", False):
        return None
    return snap.to_dict()


def build_culture_claim(
    statement: str,
    *,
    dimension: str | None,
    audience: list[str] | None,
    source_label: str | None,
    source_url: str | None,
    warmth_mode: str = "declared",
) -> Claim:
    """Bygg det källförsedda culture-claim som stänger ett alignment-gap. Speglar
    risk_corrector.build_corrective_claim, men taggat som värme-claim (facet=culture
    + dimension + audience) så det renderas i rätt persona-/dimensionssektion och
    väger in i förtroendegapet. Ops är människan i loopen → included/approved."""
    label = (source_label or "").strip() or "uppgift från bolaget"
    return Claim(
        claim_kind="narrative",
        subject_ref="org",
        statement=statement.strip()[:200],
        facet="culture",
        warmth_mode=warmth_mode if warmth_mode in ("declared", "demonstrated") else "declared",
        dimension=dimension or None,
        audience=list(audience or []),
        source=[ClaimSource(kind="manual", label=label, url=(source_url or None))],
        confidence=1.0,
        included_in_output=True,
        needs_review=False,
        review_status="approved",
    )


def fulfill_order(
    client_id: str,
    statement: str,
    *,
    dimension: str | None = None,
    audience: list[str] | None = None,
    source_label: str | None = None,
    source_url: str | None = None,
    warmth_mode: str = "declared",
) -> str:
    """Förvandla en claim-order till ett persisterat, källförsett culture-claim och
    returnera dess id. Det öppna ops-steget som det konservativa persistens-valet
    (run_and_store) medvetet sköt hit: ops belägger ordern och publicerar.

    Loopen stängs implicit — nästa audit-körning ser det nya claimet i sidinnehållet
    och täcker gapet (snapshot-modellen, samma som risk live-vs-rapport). Idempotent
    via deterministiskt id (samma statement → samma claim, ingen dubblett)."""
    claim = build_culture_claim(
        statement,
        dimension=dimension,
        audience=audience,
        source_label=source_label,
        source_url=source_url,
        warmth_mode=warmth_mode,
    )
    cid = "align-" + hashlib.sha1((claim.statement or statement).strip().encode("utf-8")).hexdigest()[:12]
    fs.claim_doc(client_id, cid).set(claim.model_dump())
    log.info("alignment %s: claim-order belagd → culture-claim %s (dim=%s)", client_id, cid, dimension)
    return cid
