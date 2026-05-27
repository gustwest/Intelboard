"""Culture-signal-extraktion: webbtext → culture-taggade claims med proveniens.

Förtroendegap-motorn (jobs/compute_trust_gap) poängsätter culture-claims (facet="culture"),
och compilern renderar dem som org-värmepredikat i JSON-LD (§10). derive_culture_claims
läser STRUKTURERADE connector-fält ur `extra`, men website-connectorn lagrar sidinnehåll
som råa textchunkar utan kulturfält — så motorn blir omatad. Den här modulen lägger
LLM-steget som läser ur den texten och persisterar grundade culture-claims.

Samma proveniens- och grundningsregel som claim_extraction: "ingen källa → inget claim".
LLM:en FÖRESLÅR en signal med ett verbatim-citat; den deterministiska källgrinden
(services/claim_grounding) AVGÖR att citatet faktiskt står i den citerade chunken. Det gör
steget modelloberoende och EU-säkert (Gemini via Vertex EU, samma fabrik som övriga steg).

Declared-signaler (utsaga/policy finns på sidan, kind="item", källa = sidan själv) väger
lågt i poängen (TAK ~0.3). Demonstrated-signaler (kollektivavtal, utmärkelse) får
ITEM_UNVERIFIED_WEIGHT tills ops verifierar underlaget via verifierings-cockpiten och
sätter en assurance-nivå — då väger de tyngre. Vi hittar alltså aldrig på "bevis" här.

No-op (0 skrivna) om ingen LLM är konfigurerad — allt ovanpå fungerar ändå.
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

# Källfält → (predikat, warmth_mode, dimension, statement-mall). Spegel av
# schema_org.claims._CULTURE_FIELD_MAP / humanization_config.PREDICATE_DIMENSION så att
# taxonomin är ETT begrepp. value None/"" → ingen claim.
SIGNAL_MAP: dict[str, tuple[str, str, str | None, str]] = {
    "ethics_policy_url": ("ethicsPolicy", "declared", "ethics", "Etikpolicy: {value}"),
    "diversity_policy_url": ("diversityPolicy", "declared", "inclusion", "Mångfaldspolicy: {value}"),
    "slogan": ("slogan", "declared", None, "Ledord: {value}"),
    "csr_topics": ("knowsAbout", "declared", "community", "Engagerade i {value}"),
    "collective_agreement": ("memberOf", "demonstrated", "transparency", "Kollektivavtal: {value}"),
    "workplace_label": ("hasCredential", "demonstrated", "wellbeing", "Utmärkelse: {value}"),
}

# Teckenbudget per anrop (jfr claim_extraction) — kultursignaler är glesa, men en stor
# crawl ska inte sprängas in i ett anrop.
BATCH_CHAR_BUDGET = 600_000

EXTRACT_PROMPT = """Du letar efter VERIFIERBARA kultur- och värdesignaler om ett företag ur
dess egna webbtexter, för en kunskapsgraf. Du får numrerade källutdrag (C1, C2, ...).

Returnera ENDAST ett JSON-objekt:
{
  "signals": [
    {
      "field": "ett av: ethics_policy_url, diversity_policy_url, slogan, csr_topics, collective_agreement, workplace_label",
      "value": "värdet — en URL, en kort fras, eller en lista av teman",
      "chunks": ["C1"],          // vilka källutdrag signalen vilar på — minst ett
      "quote": "ett VERBATIM utdrag, ordagrant kopierat ur ett av de citerade källutdragen"
    }
  ]
}

Fältens betydelse:
- ethics_policy_url / diversity_policy_url: en URL till företagets etik- respektive mångfaldspolicy.
- slogan: företagets ledord/värdeord (kort fras).
- csr_topics: samhälls-/hållbarhetsteman företaget säger sig engagera i (lista).
- collective_agreement: att företaget har kollektivavtal (ange motpart om angiven).
- workplace_label: tredjepartsmärkning/utmärkelse som arbetsgivare (Great Place to Work, Karriärföretag, ISO 45001 ...).

Hårda regler:
- Ta ALDRIG med en signal som inte uttryckligen står i ett källutdrag. Ingen källa → ingen signal.
- "quote" MÅSTE vara ordagrant kopierad ur ett citerat källutdrag (kopiera, formulera inte om).
- Ta bara med fält ur listan ovan. Hoppa över allt annat. Returnera bara JSON, ingen annan text."""


@dataclass
class _Chunk:
    chunk_id: str
    label: str
    text: str
    url: str | None


def extract_culture_for_client(
    client_id: str, llm: Any | None = None, *, force: bool = False
) -> dict[str, Any]:
    """Extrahera + persistera grundade culture-claims för EN kund. Returnerar räknare.

    Idempotent: hoppar över LLM-anropet om webbkorpusen är oförändrad sedan förra körningen
    (hash på klientdokumentet) om inte force=True. Persisterade claims har deterministiska
    id:n → omkörning skriver över i stället för att hopa dubbletter.
    """
    if not fs.client_doc(client_id).get().exists:
        raise KeyError(f"client not found: {client_id}")

    llm = llm or _pick_generator()
    if llm is None:
        log.warning("no LLM configured — culture extraction skipped")
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "no_llm"}

    chunks = _gather_chunks(client_id)
    if not chunks:
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "no_text"}

    corpus_hash = _corpus_hash(chunks)
    if not force and _already_extracted(client_id, corpus_hash):
        log.info("culture extraction %s: webbkorpus oförändrad — hoppar över", client_id)
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "unchanged"}

    by_label = {c.label: c for c in chunks}
    skipped = 0
    seen_ids: set[str] = set()

    for sig in _generate(llm, chunks):
        field = (sig.get("field") or "").strip()
        mapping = SIGNAL_MAP.get(field)
        value = sig.get("value")
        quote = (sig.get("quote") or "").strip()
        cited = [by_label[lbl] for lbl in sig.get("chunks", []) if lbl in by_label]
        if not mapping or value in (None, "", []) or not cited:
            skipped += 1  # okänt fält / tomt värde / ingen källa → ingen claim
            continue

        predicate, warmth_mode, dimension, template = mapping
        display = _display(value)
        source_text = "\n\n".join(c.text for c in cited)

        # Deterministisk källgrind AVGÖR: citatet måste finnas i den citerade chunken.
        grounded, reason = claim_grounding.verify(display, quote, source_text)
        if not grounded:
            log.info("culture-signal avvisad av källgrind (%s): %s=%s", reason, field, display[:60])
            skipped += 1
            continue

        # Värdet (det vi PUBLICERAR) måste självt stå på sidan — inte bara citatet. Annars
        # kan ett välgrundat citat smugglas ihop med ett ostött värde (värde/citat-glapp).
        if not _value_grounded(value, source_text):
            log.info("culture-signal avvisad (värde ej i källan): %s=%s", field, display[:60])
            skipped += 1
            continue

        primary = cited[0]
        claim = Claim(
            claim_kind="property",
            subject_ref="org",
            predicate=predicate,
            value=value,
            statement=template.format(value=display)[:200],
            source=[ClaimSource(
                kind="item", item_id=primary.chunk_id, url=primary.url,
                quote=quote, label="Företagets webbplats",
            )],
            confidence=1.0,
            included_in_output=True,
            needs_review=False,
            review_status="approved",
            facet="culture",
            warmth_mode=warmth_mode,
            dimension=dimension,
        )
        claim_id = _persist(client_id, predicate, display, claim)
        seen_ids.add(claim_id)

    _mark_extracted(client_id, corpus_hash)
    # `written` = unika persisterade claims (nära-dubbletter delar deterministiskt id).
    written = len(seen_ids)
    if written:
        log.info("culture extraction %s: skrev %d culture-claims (%d överhoppade)", client_id, written, skipped)
    return {"client_id": client_id, "written": written, "skipped": skipped}


def _gather_chunks(client_id: str) -> list[_Chunk]:
    """Företags-raw_items med fritext (website-chunkar m.fl.) → grundnings-chunkar."""
    chunks: list[_Chunk] = []
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        text = (raw.get("content") or "").strip()
        if not text:
            continue
        url = raw.get("url") or (raw.get("extra") or {}).get("doc_url")
        chunks.append(_Chunk(snap.id, f"C{len(chunks) + 1}", text, url))
    return chunks


def _generate(llm, chunks: list[_Chunk]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for batch in _batches(chunks):
        corpus = "\n\n".join(f"[{c.label}] {c.text}" for c in batch)
        data = llm_factory.invoke_json(llm, EXTRACT_PROMPT, corpus)
        batch_signals = (data or {}).get("signals", [])
        if isinstance(batch_signals, list):
            signals.extend(batch_signals)
    return signals


def _batches(chunks: list[_Chunk]):
    batch: list[_Chunk] = []
    size = 0
    for c in chunks:
        if batch and size + len(c.text) > BATCH_CHAR_BUDGET:
            yield batch
            batch, size = [], 0
        batch.append(c)
        size += len(c.text)
    if batch:
        yield batch


def _persist(client_id: str, predicate: str, display: str, claim: Claim) -> str:
    # Deterministiskt id (predikat + värde) → idempotent vid omkörning.
    claim_id = "cult-" + hashlib.sha1(f"{predicate}|{display}".encode("utf-8")).hexdigest()[:12]
    fs.claim_doc(client_id, claim_id).set(claim.model_dump())
    return claim_id


def _corpus_hash(chunks: list[_Chunk]) -> str:
    blob = "".join(sorted(f"{c.chunk_id}:{c.text}" for c in chunks))
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()


def _already_extracted(client_id: str, corpus_hash: str) -> bool:
    doc = fs.client_doc(client_id).get()
    data = doc.to_dict() if getattr(doc, "exists", False) else None
    return bool(data) and data.get("culture_extracted_hash") == corpus_hash


def _mark_extracted(client_id: str, corpus_hash: str) -> None:
    # Best-effort: spårningen får aldrig fälla extraktionen.
    try:
        fs.client_doc(client_id).update({
            "culture_extracted_hash": corpus_hash,
            "culture_extracted_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # noqa: BLE001
        log.exception("culture extraction: kunde inte skriva hash för %s", client_id)


def _value_grounded(value: Any, source_text: str) -> bool:
    """Det publicerade värdet måste självt stå i källan. Listvärden (csr_topics): VARJE
    post måste återfinnas, annars fälls hela signalen. Återanvänder claim_groundings
    normalisering (gemener + ihopdragna icke-alfanumeriska tecken) så blanksteg/skiljetecken
    inte fäller ett äkta värde. URL:er matchas på sin kärna (utan schema/trailing slash)."""
    norm_source = claim_grounding._normalize(source_text)
    items = value if isinstance(value, (list, tuple)) else [value]
    for item in items:
        token = str(item or "").strip()
        if not token:
            continue
        if token.startswith(("http://", "https://", "www.")):
            # URL: matcha värd+väg, tål schema/avslutande slash-skillnader.
            core = claim_grounding._normalize(token)
            if core and core in norm_source:
                continue
            return False
        norm_item = claim_grounding._normalize(token)
        if not norm_item or norm_item not in norm_source:
            return False
    return True


def _display(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value if v)
    return str(value)


# Module-level seam (patchas i tester).
def _pick_generator():
    return llm_factory.make_generator()
