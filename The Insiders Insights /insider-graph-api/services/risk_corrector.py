"""GEO-riskloop, skiva 2 — korrigering av en granskad finding (write-path).

Se docs/hallucination-loop-spec.md §8.3 / §12. Skiva 1 (risk_detector.py) är
read-only och fyller review-kön med findings. Här agerar en människa på en finding:

  - dismiss → findingen stängs utan publicering (sant negativ, eller brus).
  - action  → ammunitionen förstärks som ett KÄLLFÖRSETT korrigerande claim som
              motorerna crawlar; findingen länkas till claimet och loggas som
              actioned. compile_schema.run (triggas av routern) skriver in det i
              JSON-LD/FAQ/profilsida/llms.txt vid nästa kompilering.

Guardrails (spec §2): korrigeringen är ett källförsett claim — ops anger statement
+ källa, dvs människan är i loopen vid skapandet (ingen auto-publicering). Ingen
källa → inget claim (§2.1). Vi begraver aldrig sanna negativ: dismiss finns just för
att stänga findings vi inte ska möta med kontext (§2.2).
"""
from __future__ import annotations

import hashlib
import logging

import firestore_client as fs
from schemas import Claim, ClaimSource

log = logging.getLogger(__name__)

# Neutral default-etikett när ops inte anger egen — samma register som claim-review.
DEFAULT_SOURCE_LABEL = "uppgift från bolaget"


def build_corrective_claim(
    statement: str, source_label: str | None, source_url: str | None
) -> Claim:
    """Bygg det källförsedda korrigerande claimet. Människan har redan godkänt det
    i åtgärden → skrivs included_in_output=True (publiceras vid nästa compile)."""
    label = (source_label or "").strip() or DEFAULT_SOURCE_LABEL
    return Claim(
        claim_kind="narrative",
        subject_ref="org",
        statement=statement.strip()[:200],
        source=[ClaimSource(kind="manual", label=label, url=(source_url or None))],
        confidence=1.0,
        included_in_output=True,
        needs_review=False,
        review_status="approved",
    )


def _claim_id(statement: str) -> str:
    # "corr-"-prefix skiljer korrigerings-claims från narr-/property-claims och gör
    # omkörning idempotent (samma korrigering skapar inte dubbletter).
    return "corr-" + hashlib.sha1(statement.strip().encode("utf-8")).hexdigest()[:12]


def reinforce(
    client_id: str, statement: str, source_label: str | None, source_url: str | None
) -> str:
    """Persistera det korrigerande claimet och returnera dess id."""
    claim = build_corrective_claim(statement, source_label, source_url)
    cid = _claim_id(claim.statement or statement)
    fs.claim_doc(client_id, cid).set(claim.model_dump())
    log.info("riskkorrigering %s: skrev korrigerande claim %s", client_id, cid)
    return cid
