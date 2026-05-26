"""Riskloopens ESG-spår, skiva 2 — ingestion via "Borde svaret varit annorlunda?".

Speglar services/risk_corrector.py: kunden ser ett blint AI-svar i frontend och klickar
"Borde svaret varit annorlunda? [Ja, vi har/gör detta]" → fyller i det standardiserade
ESRS-formuläret (schemas.ESGMetricsSubmission, tre mognadsfaser). Här:

  1. Persistera inmatningen i clients/{id}/esg_submissions (rådata, för revision/onboarding).
  2. Omvandla den verifierade datan till KÄLLFÖRSEDDA korrigerande claims (kind="manual",
     "uppgift från bolaget") som motorerna crawlar — samma ammunitionsmodell som skiva 2
     (ingen källa → inget claim, spec §2.1). Claimen skrivs included_in_output=True.
  3. Om kunden kom från en specifik ESG-finding markeras den som 'actioned' och länkas till
     ammunitionsclaimen (findingen begravs inte — den möts med kontext).

Guardrails: människan (kunden) är i loopen vid skapandet; ingen auto-publicering bortom det
de själva matat in. EU-only berörs inte här — ren strukturerad inmatning, ingen LLM.
"""
from __future__ import annotations

import hashlib
import logging

from google.cloud import firestore

import firestore_client as fs
from schemas import Claim, ClaimSource, ESGMetricsSubmission

log = logging.getLogger(__name__)

DEFAULT_SOURCE_LABEL = "uppgift från bolaget"


def phase_reached(submission: ESGMetricsSubmission) -> int:
    """1 = Core, 2 = + CSRD Basic, 3 = + Enterprise Advanced (progressiv onboarding)."""
    if submission.enterprise_advanced is not None:
        return 3
    if submission.csrd_basic is not None:
        return 2
    return 1


def build_statements(company: str, submission: ESGMetricsSubmission) -> list[str]:
    """Gör de inmatade nyckeltalen till läsbara, källförsedda påståenden (claims)."""
    c = submission.core
    out = [
        f"{company} rapporterar utsläpp: Scope 1 {c.scope_1_co2e} ton CO2e, "
        f"Scope 2 {c.scope_2_co2e} ton CO2e, Scope 3 {c.scope_3_co2e} ton CO2e.",
        f"{company} har ett netto-noll-mål till år {c.net_zero_target_year}.",
        f"Andelen kvinnor i {company}s ledningsgrupp är {c.management_female_pct}% "
        f"och i styrelsen {c.board_female_pct}%.",
    ]
    if c.iso_27001_certified:
        out.append(f"{company} är ISO 27001-certifierat (informationssäkerhet).")
    if c.iso_14001_certified:
        out.append(f"{company} är ISO 14001-certifierat (miljöledning).")

    b = submission.csrd_basic
    if b is not None:
        out.append(f"{company}s ojusterade lönegap (Gender Pay Gap) är {b.unadjusted_gender_pay_gap_pct}%.")
        out.append(f"{company}s personalomsättning är {b.employee_turnover_rate}%.")
        if b.anti_corruption_policy_active:
            out.append(f"{company} har en aktiv antikorruptionspolicy.")
        if b.ecovadis_medal != "None":
            out.append(f"{company} har en EcoVadis-medalj i {b.ecovadis_medal}.")

    e = submission.enterprise_advanced
    if e is not None:
        out.append(f"Andelen förnybar energi i {company}s drift är {e.renewable_energy_share_pct}%.")
        out.append(f"{company}s återvinningsgrad är {e.waste_recycling_rate_pct}%.")
        out.append(
            f"{e.supplier_code_of_conduct_signed_pct}% av {company}s leverantörer har "
            "signerat en Supplier Code of Conduct."
        )
        out.append(
            f"{e.eu_taxonomy_alignment_turnover_pct}% av {company}s omsättning är anpassad "
            "efter EU-taxonomin."
        )
    return out


def _claim_id(statement: str) -> str:
    # "esg-"-prefix skiljer ESG-ingestion-claims och gör omkörning idempotent.
    return "esg-" + hashlib.sha1(statement.strip().encode("utf-8")).hexdigest()[:12]


def _build_claim(statement: str, source_label: str | None, source_url: str | None) -> Claim:
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


def ingest_submission(client_id: str, submission: ESGMetricsSubmission) -> dict:
    """Persistera inmatningen, skapa källförsedda claims och (om kopplad) actioned-märk
    findingen. Returnerar en sammanfattning för API-svaret."""
    client = (fs.client_doc(client_id).get().to_dict() or {})
    company = client.get("company_name") or client_id
    phase = phase_reached(submission)

    statements = build_statements(company, submission)
    claim_ids: list[str] = []
    for stmt in statements:
        claim = _build_claim(stmt, submission.source_label, submission.source_url)
        cid = _claim_id(claim.statement or stmt)
        fs.claim_doc(client_id, cid).set(claim.model_dump())
        claim_ids.append(cid)

    sub_id = "esgsub-" + hashlib.sha1(
        f"{client_id}|{submission.finding_id or ''}|{len(statements)}".encode("utf-8")
    ).hexdigest()[:16]
    fs.esg_submission_doc(client_id, sub_id).set(
        {
            "phase_reached": phase,
            "finding_id": submission.finding_id,
            "triggered_by_question": submission.triggered_by_question,
            "core": submission.core.model_dump(),
            "csrd_basic": submission.csrd_basic.model_dump() if submission.csrd_basic else None,
            "enterprise_advanced": (
                submission.enterprise_advanced.model_dump() if submission.enterprise_advanced else None
            ),
            "ammo_claim_ids": claim_ids,
            "submitted_at": firestore.SERVER_TIMESTAMP,
        }
    )

    # Möt den blinda findingen med kontext (begrav den aldrig).
    if submission.finding_id:
        ref = fs.esg_finding_doc(client_id, submission.finding_id)
        if ref.get().exists:
            ref.update(
                {
                    "review_status": "actioned",
                    "needs_review": False,
                    "action_taken": "esg_metrics_submitted",
                    "ammo_claim_ids": claim_ids,
                    "action_at": firestore.SERVER_TIMESTAMP,
                }
            )

    log.info(
        "ESG-ingestion %s: fas %d, %d claims, finding=%s",
        client_id, phase, len(claim_ids), submission.finding_id,
    )
    return {"submission_id": sub_id, "phase_reached": phase, "ammo_claim_ids": claim_ids}
