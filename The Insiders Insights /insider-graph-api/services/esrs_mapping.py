"""ESRS-mappning — kopplar ESG-loopens findings och ingestion-fält till ESRS topical
standards och upplysningskrav.

Syfte: göra rapporten användbar för en hållbarhetschef som *riktning*. När AI-motorerna
har ett informationsgap kring t.ex. Scope 3 kan vi peka på den ESRS-datapunkt det rör
(E1-6) — "materiellt krävd OCH osynlig i AI". Mappningen följer den förenklade/amended
ESRS (datapunktsuppsättningen för FY2026/2027, ~61 % färre datapunkter än 2023 års set).

VIKTIGT — detta är INTE en CSRD-rapport och INTE en dubbel väsentlighetsanalys (DMA).
ESRS vilar på en formell DMA + limited assurance + digital taggning; den här mappningen
ger bara riktning om var AI-perceptionen och ESRS-ämnen överlappar. Se NOT_COMPLIANCE_NOTE.
"""
from __future__ import annotations

# ESRS topical standards (kod → pelare + namn). Relevans-ryggraden, speglar esg_scanner.
ESRS_TOPICS: dict[str, dict[str, str]] = {
    "E1": {"pillar": "E", "name": "Klimatförändring"},
    "E2": {"pillar": "E", "name": "Föroreningar"},
    "E3": {"pillar": "E", "name": "Vatten & marina resurser"},
    "E4": {"pillar": "E", "name": "Biologisk mångfald & ekosystem"},
    "E5": {"pillar": "E", "name": "Resursanvändning & cirkulär ekonomi"},
    "S1": {"pillar": "S", "name": "Egen personal"},
    "S2": {"pillar": "S", "name": "Arbetare i värdekedjan"},
    "S3": {"pillar": "S", "name": "Berörda samhällen"},
    "S4": {"pillar": "S", "name": "Konsumenter & slutanvändare"},
    "G1": {"pillar": "G", "name": "Affärsetik & uppförande"},
}

# Ingestion-fält (3-fas-schemat) → (ESRS-topic, datapunkts-etikett). Etiketterna pekar på
# upplysningskravet i den förenklade ESRS; numreringen är vägledande för riktning.
INGESTION_FIELD_ESRS: dict[str, tuple[str, str]] = {
    # FAS 1 — Core
    "scope_1_co2e": ("E1", "E1-6 Bruttoutsläpp Scope 1"),
    "scope_2_co2e": ("E1", "E1-6 Bruttoutsläpp Scope 2"),
    "scope_3_co2e": ("E1", "E1-6 Bruttoutsläpp Scope 3"),
    "net_zero_target_year": ("E1", "E1-4 Mål för utsläppsminskning"),
    "management_female_pct": ("S1", "S1-9 Mångfald — könsfördelning i ledning"),
    "board_female_pct": ("G1", "ESRS 2 GOV-1 Könsfördelning i styrelsen"),
    "iso_27001_certified": ("G1", "Bolagsstyrning — informationssäkerhet (ISO 27001)"),
    "iso_14001_certified": ("E1", "Miljöledningssystem (ISO 14001)"),
    # FAS 2 — CSRD Basic
    "unadjusted_gender_pay_gap_pct": ("S1", "S1-16 Ojusterat lönegap"),
    "employee_turnover_rate": ("S1", "S1-6 Personalomsättning"),
    "anti_corruption_policy_active": ("G1", "G1-3 Förebyggande av korruption och mutor"),
    "ecovadis_medal": ("G1", "Oberoende ESG-betyg (EcoVadis)"),
    # FAS 3 — Enterprise Advanced
    "renewable_energy_share_pct": ("E1", "E1-5 Andel förnybar energi"),
    "waste_recycling_rate_pct": ("E5", "E5-5 Återvinningsgrad / resursutflöden"),
    "supplier_code_of_conduct_signed_pct": ("G1", "G1-2 Hantering av leverantörsrelationer"),
    "eu_taxonomy_alignment_turnover_pct": ("E1", "EU-taxonomi — andel anpassad omsättning"),
}

NOT_COMPLIANCE_NOTE = (
    "ESRS-mappningen är vägledande RIKTNING, inte en CSRD-rapport och inte en dubbel "
    "väsentlighetsanalys (DMA). Den visar var AI-motorernas bild av bolaget överlappar "
    "ESRS-ämnen — formell CSRD-rapportering kräver DMA, full datapunktstäckning, limited "
    "assurance och digital taggning."
)


def is_topic(code: str | None) -> bool:
    return code in ESRS_TOPICS


def topic_label(code: str | None) -> str:
    if not is_topic(code):
        return code or ""
    return f"{code} {ESRS_TOPICS[code]['name']}"


def topics_for_pillar(pillar: str) -> list[str]:
    return [code for code, meta in ESRS_TOPICS.items() if meta["pillar"] == pillar]


def datapoints_filled(field_names: list[str]) -> list[dict[str, str]]:
    """Vilka ESRS-datapunkter ett ingestion-formulär täcker (för submission/rapport)."""
    out: list[dict[str, str]] = []
    for name in field_names:
        ref = INGESTION_FIELD_ESRS.get(name)
        if ref:
            out.append({"field": name, "esrs_topic": ref[0], "datapoint": ref[1]})
    return out
