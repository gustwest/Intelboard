"""Bevistyp-profiler för den gemensamma verifieringsrutinen (spec §7.3).

Profilen är det enda som varierar per bevistyp; rutinen (services/verification.py) är
generisk. Ny bevistyp = ny profil HÄR, inte ändrad rutin.

Trösklarna nedan är PROVISORISKA och kalibreras i task #9 (spec §12).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Kanonisk stämpel-etikett. Får aldrig avvika mellan moduler.
CANONICAL_STAMP = "Manually verified by Geogiraph"

_DEFAULT_TEMPLATE = (
    CANONICAL_STAMP + " — granskat underlag från {instrument}, daterat {date}; "
    "bekräftat att den publicerade uppgiften överensstämmer med underlaget samt möter "
    "Geogiraphs miniminivå för urval och färskhet."
)
_DECLARED_TEMPLATE = CANONICAL_STAMP + " — uppgift från {instrument}; bolagets egen utsaga."


@dataclass(frozen=True)
class EvidenceProfile:
    evidence_type: str
    verification_mode: str               # "ops_review" | "public_registry"
    required_fields: tuple[str, ...]     # fält som måste finnas i submission.methodology
    threshold: dict[str, Any]            # t.ex. min_sample_n, min_response_rate, min_cell_n
    independence_rule: str               # dokumenterar vad "oberoende" betyder för typen
    default_validity_months: int
    suggested_assurance_level: str       # default i ops-UI:t (begränsas ändå av checks)
    verification_template: str
    gdpr: dict[str, Any] = field(default_factory=dict)


PROFILES: dict[str, EvidenceProfile] = {
    # Medarbetarenkät-aggregat (eNPS o.dyl.) — MVP:s huvudfall, ops granskar underlag.
    "survey_aggregate": EvidenceProfile(
        evidence_type="survey_aggregate",
        verification_mode="ops_review",
        required_fields=("period", "sample_n", "response_rate"),
        threshold={"min_sample_n": 30, "min_response_rate": 0.5, "min_cell_n": 10},
        independence_rule="underlag från namngivet enkätinstrument, ej egentillverkat",
        default_validity_months=12,
        suggested_assurance_level="third_party_reviewed",
        verification_template=_DEFAULT_TEMPLATE,
        gdpr={"aggregate_only": True, "min_cell_n": 10},
    ),
    # Tredjepartsmärkning (GPTW, ISO 45001, Karriärföretag) — ackrediterad utfärdare.
    "certification": EvidenceProfile(
        evidence_type="certification",
        verification_mode="ops_review",
        required_fields=("issuer", "valid_until"),
        threshold={},
        independence_rule="utfärdat av ackrediterad tredje part",
        default_validity_months=12,
        suggested_assurance_level="independently_assured",
        verification_template=_DEFAULT_TEMPLATE,
    ),
    # Lagstadgad/reviderad ESG- eller likalönerapport.
    "esg_metric": EvidenceProfile(
        evidence_type="esg_metric",
        verification_mode="ops_review",
        required_fields=("reporting_period",),
        threshold={},
        independence_rule="reviderad/lagstadgad rapport (ÅRL/CSRD, lönekartläggning)",
        default_validity_months=18,
        suggested_assurance_level="third_party_reviewed",
        verification_template=_DEFAULT_TEMPLATE,
    ),
    # Kollektivavtal — verifierbart via partsregister/publik källa.
    "collective_agreement": EvidenceProfile(
        evidence_type="collective_agreement",
        verification_mode="ops_review",
        required_fields=("counterparty",),
        threshold={},
        independence_rule="bekräftat mot fackförbund/partsregister",
        default_validity_months=24,
        suggested_assurance_level="independently_assured",
        verification_template=_DEFAULT_TEMPLATE,
    ),
    # Policy/utsaga (ethicsPolicy, diversityPolicy, slogan) — declared, bolagets ord.
    "policy_document": EvidenceProfile(
        evidence_type="policy_document",
        verification_mode="ops_review",
        required_fields=(),
        threshold={},
        independence_rule="bolagets egen publicerade policy (ej oberoende)",
        default_validity_months=24,
        suggested_assurance_level="self_declared",
        verification_template=_DECLARED_TEMPLATE,
    ),
}


def get_profile(evidence_type: str) -> EvidenceProfile | None:
    return PROFILES.get(evidence_type)
