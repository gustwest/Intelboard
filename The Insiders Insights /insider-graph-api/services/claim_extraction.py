"""Narrativ claims-extraktion: fritext → narrative-claims med proveniens.

Tre steg (docs/claims-provenance-spec.md §5):
  1. chunka   — varje raw_item med fritext (`content`) blir en chunk med stabilt id
  2. generera — LLM returnerar {statement, chunks, confidence}, aldrig fri text;
                varje claim MÅSTE ange vilka chunks det vilar på
  3. validera — ett andra LLM-pass bekräftar att chunken faktiskt stödjer påståendet

Regeln "ingen källa → inget claim": ett genererat claim utan giltig chunk-referens,
eller som inte klarar valideringen, skrivs aldrig med `included_in_output=True`.
Property-claims härleds deterministiskt i schema_org/claims.py — inte här.

No-op (tom lista) om ingen LLM är konfigurerad — pipelinen ovanpå fungerar ändå.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

import firestore_client as fs
from config import settings
from schemas import Claim, ClaimSource

log = logging.getLogger(__name__)

REVIEW_THRESHOLD = 0.7

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
      "confidence": 0.0 - 1.0
    }
  ]
}

Hårda regler:
- Påstå ALDRIG något som inte uttryckligen står i ett av källutdragen.
- Varje claim måste ange minst ett källutdrag i "chunks". Saknas stöd: ta inte med det.
- Inkludera ALDRIG följarantal, likes eller andra sociala mätvärden.
- Var konservativ med confidence. Returnera bara JSON, ingen annan text."""

VALIDATE_PROMPT = """Du är en faktagranskare. Avgör om PÅSTÅENDET stöds direkt av KÄLLAN.

Svara ENDAST med JSON: {"supported": true|false}

Stöds endast om källan uttryckligen säger det. Rimliga gissningar räknas inte."""


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

    llm = _pick_llm()
    if llm is None:
        log.warning("no LLM configured — claim extraction skipped")
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "no_llm"}

    chunks = _gather_chunks(client_id)
    if not chunks:
        return {"client_id": client_id, "written": 0, "skipped": 0, "reason": "no_text"}

    by_label = {c.label: c for c in chunks}
    written = skipped = 0

    for cand in _generate(llm, chunks):
        statement = (cand.get("statement") or "").strip()
        cited = [by_label[lbl] for lbl in cand.get("chunks", []) if lbl in by_label]
        if not statement or not cited:
            skipped += 1  # ingen källa → inget claim
            continue

        if not _validate(llm, statement, cited):
            skipped += 1  # valideringen föll → kasseras
            continue

        confidence = float(cand.get("confidence", 0.0))
        approved = confidence >= REVIEW_THRESHOLD
        claim = Claim(
            claim_kind="narrative",
            subject_ref="org",
            statement=statement[:200],
            source=[
                ClaimSource(kind="item", item_id=c.chunk_id, employee_id=c.employee_id)
                for c in cited
            ],
            confidence=confidence,
            included_in_output=approved,
            needs_review=not approved,
        )
        _persist(client_id, claim)
        written += 1

    return {"client_id": client_id, "written": written, "skipped": skipped}


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
    corpus = "\n\n".join(f"[{c.label}] {c.text}" for c in chunks)
    data = _invoke_json(llm, GENERATE_PROMPT, corpus)
    claims = (data or {}).get("claims", [])
    return claims if isinstance(claims, list) else []


def _validate(llm, statement: str, cited: list[Chunk]) -> bool:
    source_text = "\n\n".join(c.text for c in cited)
    payload = f"PÅSTÅENDE:\n{statement}\n\nKÄLLA:\n{source_text}"
    data = _invoke_json(llm, VALIDATE_PROMPT, payload)
    return bool((data or {}).get("supported") is True)


def _persist(client_id: str, claim: Claim) -> None:
    # Deterministiskt id → idempotent vid omkörning (skriv inte dubbletter).
    claim_id = "narr-" + hashlib.sha1((claim.statement or "").encode()).hexdigest()[:12]
    fs.claim_doc(client_id, claim_id).set(claim.model_dump())


def _invoke_json(llm, system: str, user: str) -> dict[str, Any] | None:
    try:
        resp = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        raw = resp.content if hasattr(resp, "content") else str(resp)
    except Exception as exc:  # blockering / timeout: logga, hoppa över
        log.warning("claim-extraction LLM call failed: %s", exc)
        return None
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _pick_llm():
    if settings.openai_api_key:
        return ChatOpenAI(api_key=settings.openai_api_key, model="gpt-4o", temperature=0, timeout=30)
    if settings.gemini_api_key:
        return ChatGoogleGenerativeAI(
            google_api_key=settings.gemini_api_key, model="gemini-1.5-pro", temperature=0, timeout=30
        )
    return None
