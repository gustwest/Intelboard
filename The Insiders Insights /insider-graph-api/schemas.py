"""Pydantic-modeller för API:t."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class EmployeeInput(BaseModel):
    name: str
    linkedin_url: str
    title: str | None = None
    gender: str | None = None
    # opt-out: connectors slutar hämta ny data för personen. Redan insamlad data
    # ligger kvar tills den raderas explicit.
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
    # Wikidata-ID (Q-nummer) — matar Wikipedia/Wikidata-connectorn (faktabas +
    # entity-reconciliation via sameAs). Exakt match, ingen namn-auto-matchning.
    wikidata_id: str | None = None
    # Svenskt organisationsnummer (10 siffror, ev. med bindestreck). Lyfts till
    # Organization.identifier (PropertyValue, propertyID="SE-orgnr") så AI-motorer får
    # en hård svensk identifierare. Auto-extraherbart via GLEIF (local_identifiers).
    org_number: str | None = None
    # Direkt-URL till företagets logotyp (raster eller SVG). Lyfts till Organization.logo.
    # Auto-extraherbart via website-connectorns og:image — manuell input vinner alltid.
    logo_url: str | None = None
    active_connectors: list[str] | None = None
    employees: list[EmployeeInput] = Field(default_factory=list)
    # Connector-params som matar respektive connectors fetch(). Lagras under
    # client.settings (website, rss_feeds).
    website_start_url: str | None = None
    rss_feeds: list[RssFeed] = Field(default_factory=list)
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
    # Manuell Geogiraph-verifiering (docs/humanization-trust-gap-spec.md §7). assurance_level
    # styr VIKTEN i compute_trust_gap (§8); kind (ovan) styr hur vi CITERAR. Skilda axlar.
    # verification_id pekar på Verification-recordet källan kom ur (clients/{id}/verifications).
    assurance_level: Literal[
        "self_declared", "third_party_reviewed", "independently_assured"
    ] | None = None
    verification_id: str | None = None


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
    # "aggregated" = originalet har slagits ihop till ett narrative-claim (se
    # services/claim_aggregation.py). Bevaras som evidens men renderas aldrig —
    # läsvägarna skippar det. Tillåts i literalen så att Claim(**raw) aldrig
    # kraschar även om en sådan post råkar ha included_in_output=True.
    review_status: Literal["approved", "rejected", "aggregated"] | None = None
    # Sätts när validator-LLM:en (Claude via Vertex EU) bekräftat att claimet stöds av
    # sin källa. Narrative-claims valideras alltid före persist (ingen källa/validering
    # → inget claim), så ett persisterat narrative-claim bär alltid dessa. ISO-tid + modell.
    validated_at: str | None = None
    validated_by: str | None = None
    # --- Humaniseringslager (se docs/humanization-trust-gap-spec.md §5.1) -------
    # facet skiljer operationella claims från kultur-/värmeclaims. Default
    # "operational" → allt gammalt beteende oförändrat (inga befintliga claims berörs).
    facet: Literal["operational", "culture"] = "operational"
    # warmth_mode (endast facet="culture"): "declared" = en utsaga/policy finns;
    # "demonstrated" = en handling/utfall med tredjepartsunderlag (väger tyngre i §8).
    warmth_mode: Literal["declared", "demonstrated"] | None = None
    # dimension: en av de sex värmedimensionerna i humanization_config.DIMENSIONS
    # (endast facet="culture"). None för slogan o.dyl. som inte hör till en dimension.
    dimension: str | None = None
    # --- Persona-relevans (Fas 2.1b, docs/persona-model.md §4.2) ----------------
    # audience: persona-id:n från services/persona_registry som detta claim är
    # *särskilt* relevant för. Tom = "evergreen" (för alla personor — default).
    # Driver Schema.org Audience-markup (Fas 2.1f) och llms.txt-sektionering.
    # Härleds vid claim-persistens av services/persona_derivation.derive_claim_audience;
    # kan ops-justeras manuellt. Backward-compat: existerande claims utan fältet
    # läses som tom lista (= evergreen).
    audience: list[str] = Field(default_factory=list)


# --- Manuell Geogiraph-verifiering ("Manually verified by Geogiraph") --------
# Gemensam verifieringsrutin (docs/humanization-trust-gap-spec.md §7,
# services/verification.py). Delas av ESG, humanisering och framtida moduler.

ASSURANCE_LEVELS = ("self_declared", "third_party_reviewed", "independently_assured")


class VerificationSubject(BaseModel):
    """Vad verifieringen handlar om — siffran/utsagan ett bevis ska styrka."""

    domain: str                              # "culture" | "esg" | ...
    dimension: str | None = None             # värmedimension (§5.2) om domain="culture"
    metric: str | None = None                # t.ex. "eNPS", "board_female_pct"
    value: Any | None = None
    # schema.org-predikat det stödda claimet fyller (t.ex. "aggregateRating").
    # Saknas → narrative-claim byggs av `statement` istället.
    predicate: str | None = None
    statement: str | None = None             # läsbar mening för profil/llms.txt


class VerificationSubmission(BaseModel):
    """Ops-inlämning på kundkortet (§7.5). Ingen kundyta i MVP — intag via mejl/fil."""

    evidence_type: str                       # väljer profil (verification_profiles.py)
    subject: VerificationSubject
    # Uppladdad fil — revisionsspår. Krävs för allt utom self_declared.
    artifact_ref: str | None = None
    instrument_or_issuer: str | None = None
    document_date: str | None = None         # ISO; underlagets datum (färskhet)
    methodology: dict[str, Any] = Field(default_factory=dict)  # period, sample_n, response_rate…
    # Mänskliga omdömen ops bockar (oberoende/spårbarhet). Metodik + färskhet auto-bedöms.
    ops_checks: dict[str, bool] = Field(default_factory=dict)
    chosen_assurance_level: str | None = None  # ops väljer; begränsas av checks (§7.5)
    verified_by: str = "ops"
    rejected_reason: str | None = None       # satt → verdict="rejected", ingen ClaimSource


class Verification(BaseModel):
    """Persisterat verifieringsrecord (§5.4). clients/{id}/verifications/{id}."""

    evidence_type: str
    subject: VerificationSubject
    artifact_ref: str | None = None
    instrument_or_issuer: str | None = None
    document_date: str | None = None
    methodology: dict[str, Any] = Field(default_factory=dict)
    # De fyra generiska kontrollerna (§7.2), upplösta till booleans.
    checks: dict[str, bool] = Field(default_factory=dict)
    assurance_level: str | None = None       # slutlig, ev. nedgraderad av checks
    verdict: Literal["verified", "self_declared", "rejected"]
    verification_text: str
    verified_by: str = "ops"
    verified_at: str | None = None
    expires_at: str | None = None


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
