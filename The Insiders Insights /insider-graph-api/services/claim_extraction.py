"""Narrativ claims-extraktion: fritext → narrative-claims med proveniens.

Tre steg (docs/claims-provenance-spec.md §5):
  1. chunka   — varje raw_item med fritext (`content`) blir en chunk med stabilt id
  2. generera — LLM returnerar {statement, chunks, confidence}, aldrig fri text;
                varje claim MÅSTE ange vilka chunks det vilar på
  3. validera — ett andra LLM-pass bekräftar att chunken faktiskt stödjer påståendet

Hybrid-modeller (services/llm.py): generatorn (stort kontextfönster) genererar,
validatorn (vasst resonemang) validerar. Generering batchas så att en stor korpus
(flersidig crawl + PDF:er) inte sprängs in i ett enda anrop.

Regeln "ingen källa → inget claim": ett genererat claim utan giltig chunk-referens,
eller som inte klarar valideringen, skrivs aldrig med `included_in_output=True`.
Property-claims härleds deterministiskt i schema_org/claims.py — inte här.

No-op (tom lista) om ingen LLM är konfigurerad — pipelinen ovanpå fungerar ändå.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from schemas import Claim, ClaimSource
from services import claim_grounding
from services import llm as llm_factory

log = logging.getLogger(__name__)

REVIEW_THRESHOLD = 0.7
# Teckenbudget per genereringsanrop. Korpusar större än så delas i batchar, så
# även en stor crawl ryms (med marginal mot kontextfönstret).
BATCH_CHAR_BUDGET = 600_000
# Självkonsistens: kör valideringen så här många gånger; ETT icke-stödt utfall fäller
# claimet. Med temperatur (make_claim_validator) ger passen verklig variation.
SELF_CONSISTENCY_SAMPLES = 2

GENERATE_PROMPT = """Du extraherar faktapåståenden om ett företag ur källtexter.

Du får numrerade källutdrag (C1, C2, ...). Extrahera enskilda, självbärande
påståenden om FÖRETAGET — varje påstående ska gå att förstå utan sin kontext
(skriv ut subjektet, inga "vi"/"de"/"det").

Returnera ENDAST ett JSON-objekt:
{
  "claims": [
    {
      "statement": "ett självbärande påstående, max 200 tecken",
      "chunks": ["C1"],            // vilka källutdrag stödjer påståendet — minst ett
      "quote": "ett VERBATIM utdrag, ordagrant kopierat ur ett av de citerade källutdragen, som stödjer påståendet",
      "confidence": 0.0 - 1.0
    }
  ]
}

Hårda regler:
- Påstå ALDRIG något som inte uttryckligen står i ett av källutdragen.
- Varje claim måste ange minst ett källutdrag i "chunks". Saknas stöd: ta inte med det.
- "quote" MÅSTE vara ordagrant kopierad ur ett citerat källutdrag (kopiera, formulera inte om).
  Varje siffra i påståendet måste finnas i källutdraget. Hittar du inget ordagrant stöd: hoppa över claimet.
- Inkludera ALDRIG följarantal, likes eller andra sociala mätvärden.
- Var konservativ med confidence. Returnera bara JSON, ingen annan text."""

# Adversariell granskning: be modellen aktivt leta skäl att påståendet INTE stöds innan den
# avgör. Minskar bekräftelsebias jämfört med en rak "stöds detta?"-fråga.
VALIDATE_PROMPT = """Du är en kritisk faktagranskare. Din uppgift är att FÖRSÖKA underkänna
PÅSTÅENDET: leta aktivt efter varje skäl att det INTE stöds ordagrant av KÄLLAN — utelämnade
förbehåll, siffror som inte står i källan, tolkningar utöver texten, fel subjekt.

Svara ENDAST med JSON: {"reasons_against": ["..."], "supported": true|false}

Sätt supported=true ENDAST om du inte hittar något hållbart skäl emot och källan uttryckligen
säger det. Rimliga gissningar och slutledningar räknas INTE som stöd."""


@dataclass
class Chunk:
    chunk_id: str          # raw_item-dokumentets id (källans stabila id)
    employee_id: str | None
    label: str             # promptetikett, t.ex. "C1"
    text: str


def extract_claims_for_client(client_id: str) -> dict[str, Any]:
    """Kör hela pipelinen och persistera godkända/review-pliktiga narrative-claims."""
    if not fs.client_doc(client_id).get().exists:
        raise KeyError(f"client not found: {client_id}")

    generator = _pick_generator()
    validator = _pick_validator()
    if generator is None:
        log.warning("no LLM configured — claim extraction skipped")
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "no_llm"}

    chunks = _gather_chunks(client_id)
    if not chunks:
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "no_text"}

    by_label = {c.label: c for c in chunks}
    written = skipped = 0

    for cand in _generate(generator, chunks):
        statement = (cand.get("statement") or "").strip()
        quote = (cand.get("quote") or "").strip()
        cited = [by_label[lbl] for lbl in cand.get("chunks", []) if lbl in by_label]
        if not statement or not cited:
            skipped += 1  # ingen källa → inget claim
            continue

        source_text = "\n\n".join(c.text for c in cited)

        # Deterministisk källgrind AVGÖR (modelloberoende): citatet måste finnas i källan och
        # alla siffror i påståendet vara grundade. LLM:en föreslår — den här regeln dömer.
        grounded, reason = claim_grounding.verify(statement, quote, source_text)
        if not grounded:
            log.info("claim avvisad av källgrind (%s): %s", reason, statement[:60])
            skipped += 1
            continue

        # Extra LLM-lager ovanpå grinden: adversariell validering med självkonsistens.
        if not _validate(validator, statement, source_text):
            skipped += 1  # valideringen föll → kasseras
            continue

        confidence = float(cand.get("confidence", 0.0))
        approved = confidence >= REVIEW_THRESHOLD
        sources = [
            ClaimSource(kind="item", item_id=c.chunk_id, employee_id=c.employee_id)
            for c in cited
        ]
        sources[0].quote = quote  # bevara det verifierade spannet som proveniens/revisionsspår
        claim = Claim(
            claim_kind="narrative",
            subject_ref="org",
            statement=statement[:200],
            source=sources,
            confidence=confidence,
            included_in_output=approved,
            needs_review=not approved,
            # Klarade källgrind + validator → stämpla att (och hur) det skedde.
            validated_at=datetime.now(timezone.utc).isoformat(),
            validated_by=_validated_by(),
        )
        _persist(client_id, claim)
        written += 1

    return {"client_id": client_id, "written": written, "skipped": skipped}


def _validated_by() -> str:
    return f"{llm_factory.GEO_VALIDATOR_MODEL} + deterministisk källgrind"


def _gather_chunks(client_id: str) -> list[Chunk]:
    chunks: list[Chunk] = []

    def add(snap, employee_id: str | None) -> None:
        raw = snap.to_dict() or {}
        text = (raw.get("content") or "").strip()
        if not text:
            return
        idx = len(chunks) + 1
        chunks.append(Chunk(snap.id, employee_id, f"C{idx}", text))

    for snap in fs.raw_items_company_col(client_id).stream():
        add(snap, None)
    for emp_id, _emp in fs.iter_employees(client_id):
        for snap in fs.raw_items_col(client_id, emp_id).stream():
            add(snap, emp_id)
    return chunks


def _generate(llm, chunks: list[Chunk]) -> list[dict[str, Any]]:
    """Generera claims batchvis så en stor korpus inte sprängs in i ett anrop."""
    claims: list[dict[str, Any]] = []
    for batch in _batches(chunks):
        corpus = "\n\n".join(f"[{c.label}] {c.text}" for c in batch)
        data = llm_factory.invoke_json(llm, GENERATE_PROMPT, corpus)
        batch_claims = (data or {}).get("claims", [])
        if isinstance(batch_claims, list):
            claims.extend(batch_claims)
    return claims


def _batches(chunks: list[Chunk]):
    """Dela chunks i batchar under teckenbudgeten. Etiketterna (C1..) är globala,
    så claims i en batch refererar fortfarande rätt chunk via by_label."""
    batch: list[Chunk] = []
    size = 0
    for c in chunks:
        if batch and size + len(c.text) > BATCH_CHAR_BUDGET:
            yield batch
            batch, size = [], 0
        batch.append(c)
        size += len(c.text)
    if batch:
        yield batch


def _validate(llm, statement: str, source_text: str) -> bool:
    """Adversariell validering med självkonsistens: kör SELF_CONSISTENCY_SAMPLES pass och
    kräv att ALLA säger supported. Ett enda icke-stött (eller felande) utfall fäller claimet."""
    payload = f"PÅSTÅENDE:\n{statement}\n\nKÄLLA:\n{source_text}"
    for _ in range(SELF_CONSISTENCY_SAMPLES):
        data = llm_factory.invoke_json(llm, VALIDATE_PROMPT, payload)
        if (data or {}).get("supported") is not True:
            return False
    return True


# Fält extraktionen får uppdatera även på ett redan granskat claim — färskare
# proveniens stärker bara leveransen. Allt annat (själva beslutet, ev. ops-redigerad
# statement, aggregerings-metadata) ägs av gransknings-/aggregeringsflödet och bevaras.
_MACHINE_OWNED_FIELDS = ("source", "confidence", "validated_at", "validated_by")
# Statusar som betyder "en människa (eller aggregeringen) har redan bestämt sig".
# Beslutet är sticky på statement-hashen: maskinen återöppnar aldrig — bara en operatör.
_DECIDED_STATES = ("approved", "rejected", "aggregated")


def _merge_preserving_review(existing: dict[str, Any], fresh: dict[str, Any]) -> dict[str, Any]:
    """Bygg dokumentet som ska skrivas vid (om)extraktion.

    Finns redan ett granskningsbeslut: bevara hela det befintliga dokumentet och uppdatera
    bara den maskinägda proveniensen — så ett godkänt/avvisat claim ALDRIG nollställs
    tillbaka till granskningskön vid ett schemalagt omkörnings-pass. Saknas beslut (nytt
    eller ännu ogranskat claim): skriv det färska claimet rakt av.
    """
    if existing.get("review_status") in _DECIDED_STATES:
        return {**existing, **{k: fresh[k] for k in _MACHINE_OWNED_FIELDS if k in fresh}}
    return fresh


def _persist(client_id: str, claim: Claim) -> None:
    # Deterministiskt id → idempotent vid omkörning (skriv inte dubbletter).
    claim_id = "narr-" + hashlib.sha1((claim.statement or "").encode()).hexdigest()[:12]
    fresh = claim.model_dump()
    # Transaktionell read-modify-write: bevarar ett ev. granskningsbeslut i samma atomära
    # steg (stänger racet mot review-flödets .update()). Se _merge_preserving_review.
    fs.write_claim_preserving_review(
        client_id, claim_id, lambda existing: _merge_preserving_review(existing, fresh)
    )


# Module-level seams (patchas i tester).
def _pick_generator():
    return llm_factory.make_generator()


def _pick_validator():
    return llm_factory.make_claim_validator()
