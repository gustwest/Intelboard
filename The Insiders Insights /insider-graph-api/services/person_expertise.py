"""R1 — Person-expertis som källa: CV/bio → smal LLM-extraktion → person-claims.

Flödet (Medarbetare-boxen är navet, se docs/ux-audit-plan-2026-06-08.md R1):
  1. Kunden mejlar CV/bio för en nyckelperson; operatören laddar upp PER MEDARBETARE
     med ett dokumenterat samtyckes-intyg (personens eget samtycke, insamlat av kunden).
  2. Smal LLM-extraktion (EU-Vertex) → BARA yrkesrelaterad expertis: expertområden
     (knowsAbout) + citerbara meriter. Adress/telefon/födelsedatum/privatliv slängs
     vid källan (dataminimering) — rå-CV:t persisteras aldrig.
  3. Claims får needs_review=True → Granska-kön. Godkända kompileras till personens
     befintliga Person-nod i publika grafen (knowsAbout + Claim-noder, "uppgift från
     personen").

GDPR-grindar: opted_out blockerar ingest helt; kompilatorn filtrerar dessutom bort
opt:ade personers nod + claims; GDPR-radering rensar claims via subject_ref (befintlig
_purge_employee_from_claims matchar subject_ref == employee_id — därför används rå
employee_id som subject_ref här, inte ett prefix).
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from schemas import Claim, ClaimSource
from services import llm as llm_factory
from services.attested_ingest import read_text

log = logging.getLogger(__name__)

PERSON_SOURCE_LABEL = "CV/biografi, uppgift från personen"
CLAIM_ID_PREFIX = "pex-"  # person-expertis; replace-vid-omkörning städar på prefixet
MAX_AREAS = 8
MAX_STATEMENTS = 6
MAX_STATEMENT_CHARS = 250
# LLM-extraherat utan käll-grind per mening → Medel-bandet i Granska tills människa godkänt.
EXTRACTED_CONFIDENCE = 0.6

_EXTRACT_SYSTEM = """Du extraherar YRKESEXPERTIS ur ett CV eller en biografi, för publicering
på en publik företagsprofil som AI-motorer läser. Svara på svenska.

Extrahera ENDAST:
- "expertise_areas": personens expertområden/kompetenser (korta substantivfraser,
  t.ex. "inbyggda system", "M&A-rådgivning"). Max {max_areas} st, viktigast först.
- "statements": citerbara, yrkesrelaterade meriter/erfarenheter i tredje person med
  personens namn (t.ex. "Anna Andersson har lett utvecklingsteam inom fordonsindustrin
  i 12 år"). Max {max_statements} st, max {max_chars} tecken styck. Bygg ENBART på
  dokumentet — hitta aldrig på.

FÖRBJUDET att ta med (dataminimering, GDPR): adress, telefonnummer, e-post,
födelsedatum/ålder, personnummer, foto-referenser, civilstånd, familj, hälsa,
fritidsintressen, referenspersoners namn, lön. Endast yrkesrelaterad expertis.

Returnera ENDAST JSON: {{"expertise_areas": ["..."], "statements": ["..."]}}"""


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def extract_expertise(text: str, person_name: str, llm=None) -> dict[str, list[str]] | None:
    """Smal Person-projektion ur dokumenttexten. None vid LLM-fel (anroparen avgör).
    Module-seam (llm=None → make_validator) → patchas i tester."""
    llm = llm or llm_factory.make_validator()
    if llm is None:
        return None
    system = _EXTRACT_SYSTEM.format(
        max_areas=MAX_AREAS, max_statements=MAX_STATEMENTS, max_chars=MAX_STATEMENT_CHARS
    )
    payload = f"Personens namn: {person_name}\n\nDokument:\n{text[:20000]}"
    data = llm_factory.invoke_json(llm, system, payload)
    if not isinstance(data, dict):
        return None
    areas = [str(a).strip() for a in (data.get("expertise_areas") or []) if str(a).strip()]
    statements = [str(s).strip()[:MAX_STATEMENT_CHARS]
                  for s in (data.get("statements") or []) if str(s).strip()]
    if not areas and not statements:
        return None
    return {"expertise_areas": areas[:MAX_AREAS], "statements": statements[:MAX_STATEMENTS]}


def ingest_person_expertise(
    client_id: str,
    employee_id: str,
    filename: str | None,
    content: bytes,
    *,
    consent_attested: bool,
    llm=None,
) -> dict[str, Any]:
    """Läs CV/bio, extrahera smal expertis-projektion och persistera som person-claims
    i granskningskön. Ersätter personens tidigare expertis-claims (replace).

    Höjer ValueError vid: kund/medarbetare saknas, opted_out, saknat samtyckes-intyg,
    oläsbart dokument eller misslyckad extraktion."""
    if not consent_attested:
        raise ValueError(
            "Samtyckes-intyg krävs: personens eget samtycke till publicering måste vara "
            "dokumenterat hos kunden innan expertis kan publiceras."
        )
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise ValueError(f"client not found: {client_id}")
    emp_snap = fs.employee_doc(client_id, employee_id).get()
    if not emp_snap.exists:
        raise ValueError(f"employee not found: {employee_id}")
    emp = emp_snap.to_dict() or {}
    if emp.get("opted_out"):
        raise ValueError(
            "Medarbetaren har opt:at ut — ingen expertis kan tas in eller publiceras."
        )

    text = read_text(filename, content)
    if not text.strip():
        raise ValueError("Dokumentet är tomt eller kunde inte läsas (PDF/text/markdown stöds).")

    extracted = extract_expertise(text, emp.get("name") or employee_id, llm=llm)
    if extracted is None:
        raise ValueError("Extraktionen misslyckades — ingen yrkesexpertis kunde utvinnas.")

    # Replace: städa personens tidigare expertis-claims (på id-prefixet) så omkörning
    # med nytt CV aldrig lämnar föråldrade meriter kvar i kön eller leveransen.
    removed = clear_person_expertise(client_id, employee_id)

    src = ClaimSource(kind="attested", label=PERSON_SOURCE_LABEL,
                      attested_at=_today(), employee_id=employee_id)
    digest = hashlib.sha1(content).hexdigest()[:10]
    written = 0
    for i, area in enumerate(extracted["expertise_areas"]):
        claim = Claim(
            claim_kind="property", subject_ref=employee_id,
            predicate="knowsAbout", value=area,
            source=[src], confidence=EXTRACTED_CONFIDENCE,
            included_in_output=False, needs_review=True,
        )
        fs.claim_doc(client_id, f"{CLAIM_ID_PREFIX}{employee_id}-{digest}-a{i}").set(claim.model_dump())
        written += 1
    for i, stmt in enumerate(extracted["statements"]):
        claim = Claim(
            claim_kind="narrative", subject_ref=employee_id,
            statement=stmt,
            source=[src], confidence=EXTRACTED_CONFIDENCE,
            included_in_output=False, needs_review=True,
        )
        fs.claim_doc(client_id, f"{CLAIM_ID_PREFIX}{employee_id}-{digest}-s{i}").set(claim.model_dump())
        written += 1

    # Samtyckes-intyget dokumenteras på medarbetaren (vem som intygar = kunden; vi
    # loggar att intyget togs emot + när). Merge-write så övriga fält bevaras.
    now_iso = datetime.now(timezone.utc).isoformat()
    fs.employee_doc(client_id, employee_id).set({
        **emp, "consent_attested_at": now_iso, "expertise_uploaded_at": now_iso,
    })

    log.info("person-expertis %s/%s: %d claims till granskning (%d gamla ersatta)",
             client_id, employee_id, written, removed)
    return {"claims_created": written, "replaced": removed, "needs_review": True}


def clear_person_expertise(client_id: str, employee_id: str) -> int:
    """Ta bort personens expertis-claims (alla pex-claims för medarbetaren). Returnerar
    antal raderade. Rör INTE andra claims som refererar medarbetaren."""
    removed = 0
    prefix = f"{CLAIM_ID_PREFIX}{employee_id}-"
    for claim_id, _data in fs.iter_claims(client_id):
        if claim_id.startswith(prefix):
            fs.claim_doc(client_id, claim_id).delete()
            removed += 1
    return removed


def expertise_status_by_employee(client_id: str) -> dict[str, dict[str, int]]:
    """employee_id → {in_review, included, rejected} för UI-status i Medarbetare-boxen.
    En enda claims-iteration för alla medarbetare."""
    out: dict[str, dict[str, int]] = {}
    for claim_id, data in fs.iter_claims(client_id):
        if not claim_id.startswith(CLAIM_ID_PREFIX):
            continue
        emp_id = data.get("subject_ref") or ""
        bucket = out.setdefault(emp_id, {"in_review": 0, "included": 0, "rejected": 0})
        if data.get("review_status") == "rejected":
            bucket["rejected"] += 1
        elif data.get("included_in_output"):
            bucket["included"] += 1
        else:
            bucket["in_review"] += 1
    return out
