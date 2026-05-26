"""Pydantic-modeller för API:t."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class EmployeeInput(BaseModel):
    name: str
    linkedin_url: str
    title: str | None = None
    node_type: str = "aktiv"
    gender: str | None = None
    # opt-out: connectors slutar hämta ny data för personen (scrape-jobben hoppar
    # över hen). Redan insamlad data ligger kvar tills den raderas explicit.
    opted_out: bool = False


class RssFeed(BaseModel):
    url: str
    schema_type: str = "NewsArticle"
    label: str | None = None


class OnboardRequest(BaseModel):
    client_id: str = Field(..., description="slug matching the Insiders Insights customer")
    company_name: str
    company_linkedin_url: str | None = None
    # LEI-kod (Legal Entity Identifier) — matar GLEIF-connectorn (koncernstruktur).
    lei: str | None = None
    active_connectors: list[str] | None = None
    employees: list[EmployeeInput] = Field(default_factory=list)
    # Connector-params som matar respektive connectors fetch(). Lagras under
    # client.settings (website, rss_feeds, scrape_employee_profiles).
    website_start_url: str | None = None
    rss_feeds: list[RssFeed] = Field(default_factory=list)
    scrape_employee_profiles: bool = False
    # Hosting-tier (se docs/claims-provenance-spec.md §7). "premium" → profilsidan
    # på kundens egen domän; profile_base_url sätter @id-basen för JSON-LD.
    tier: Literal["default", "premium"] = "default"
    profile_base_url: str | None = None


class OnboardResponse(BaseModel):
    client_id: str
    employees_created: int
    employee_ids: list[str]


# --- LinkedIn-kvartalssnapshot: statusvärden (spec §4) ---------------------
# Delas av uppladdning (routers/linkedin.py), intern verifiering (routers/review.py)
# och korsvalideringen (schema_org/claims.py) så ingen stavar fel på egen hand.


class LinkedInStatus:
    PENDING = "PENDING_INTERNAL_VERIFICATION"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


# --- Claims & proveniens (se docs/claims-provenance-spec.md) ---------------


class ClaimSource(BaseModel):
    """Källa bakom ett claim. Ett claim utan minst en källa skrivs aldrig."""

    kind: Literal["item", "manual", "attested"] = "item"
    # kind="item": peka på ett raw_item-dokument (→ url, datum).
    item_id: str | None = None
    # employee_id sätts om källan är ett medarbetar-item; None = företagsnivå.
    employee_id: str | None = None
    # kind="manual": neutral etikett, default "uppgift från bolaget", omskrivningsbar.
    # kind="attested": etikett för det vi går i god för, t.ex.
    # "LinkedIn-data, verifierad av Geogiraph".
    label: str | None = None
    # kind="attested": en källa vi själva verifierar (t.ex. LinkedIns officiella
    # export). Starkare än "manual" (företagets ord) men inte självverifierbar via
    # publik URL → egen typ. attested_at bär färskheten (ISO-datum) som krävs för att
    # attesteringen ska behålla trovärdighet. url = valfri publik ankare (t.ex.
    # kundens LinkedIn-sida). Se docs/claims-provenance-spec.md §4.
    attested_at: str | None = None
    url: str | None = None
    # Verbatim källspann som den deterministiska grinden (services/claim_grounding) verifierat
    # finns i källtexten och stödjer påståendet. Bevaras som proveniens/revisionsspår.
    quote: str | None = None


class Claim(BaseModel):
    """Ett källförsett påstående. `property` fyller en schema.org-egenskap,
    `narrative` blir en mening i prosa. Båda renderas ur samma claims-lager."""

    claim_kind: Literal["property", "narrative"]
    # Logisk subjekt-referens som kompilatorn löser till ett @id:
    # "org" för organisationen, annars ett employee_id.
    subject_ref: str = "org"
    # property: schema.org-egenskap + värde.
    predicate: str | None = None
    value: Any | None = None
    # narrative (och valfri visningstext för property): själva meningen.
    statement: str | None = None
    source: list[ClaimSource] = Field(default_factory=list)
    confidence: float = 1.0
    included_in_output: bool = True
    needs_review: bool = False
    review_status: Literal["approved", "rejected"] | None = None
    # Sätts när validator-LLM:en (Claude via Vertex EU) bekräftat att claimet stöds av
    # sin källa. Narrative-claims valideras alltid före persist (ingen källa/validering
    # → inget claim), så ett persisterat narrative-claim bär alltid dessa. ISO-tid + modell.
    validated_at: str | None = None
    validated_by: str | None = None


# --- ESG & CSRD Perception Audit: trestegs ingestion-schema ------------------
# "Borde svaret varit annorlunda?" → kunden matar in verifierade ESG-data i tre
# mognadsfaser (progressiv onboarding). Strikt validering; FAS 1 obligatorisk,
# FAS 2 och 3 frivilliga. Datan blir källförsedda korrigerande claims (skiva 2).


class ESGCoreMetrics(BaseModel):
    """FAS 1: CORE ESG — de akuta riskräddarna."""

    scope_1_co2e: float = Field(..., ge=0, description="Scope 1, ton CO2e")
    scope_2_co2e: float = Field(..., ge=0, description="Scope 2, ton CO2e")
    scope_3_co2e: float = Field(..., ge=0, description="Scope 3, ton CO2e")
    net_zero_target_year: int = Field(..., ge=2020, le=2100)
    management_female_pct: int = Field(..., ge=0, le=100)
    board_female_pct: int = Field(..., ge=0, le=100)
    iso_27001_certified: bool
    iso_14001_certified: bool


class ESGCsrdBasicMetrics(BaseModel):
    """FAS 2: CSRD BASIC — Social & Governance."""

    unadjusted_gender_pay_gap_pct: float = Field(..., ge=-100, le=100)
    employee_turnover_rate: float = Field(..., ge=0, le=100)
    anti_corruption_policy_active: bool
    ecovadis_medal: Literal["None", "Bronze", "Silver", "Gold", "Platinum"] = "None"


class ESGEnterpriseAdvancedMetrics(BaseModel):
    """FAS 3: ENTERPRISE ADVANCED — guldstandarden för AI-inköpare."""

    renewable_energy_share_pct: float = Field(..., ge=0, le=100)
    waste_recycling_rate_pct: float = Field(..., ge=0, le=100)
    supplier_code_of_conduct_signed_pct: float = Field(..., ge=0, le=100)
    eu_taxonomy_alignment_turnover_pct: float = Field(..., ge=0, le=100)


class ESGMetricsSubmission(BaseModel):
    """Inskickat ESG-formulär. FAS 1 obligatorisk; FAS 2/3 frivilliga (progressiv
    onboarding). `finding_id` länkar tillbaka till den ESG-finding kunden reagerade på."""

    finding_id: str | None = Field(
        default=None, description="ESG-findingen som triggade 'Borde svaret varit annorlunda?'."
    )
    triggered_by_question: str | None = Field(
        default=None, description="Den blinda AI-fråga kunden reagerade på."
    )
    source_label: str | None = Field(
        default=None, description="Proveniens-etikett (default: uppgift från bolaget)."
    )
    source_url: str | None = None
    core: ESGCoreMetrics
    csrd_basic: ESGCsrdBasicMetrics | None = None
    enterprise_advanced: ESGEnterpriseAdvancedMetrics | None = None
