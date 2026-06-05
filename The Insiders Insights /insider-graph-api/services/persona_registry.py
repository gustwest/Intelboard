"""Persona-registry — kurerad palett av 10 personor (Fas 2.1a).

Designkontrakt: docs/persona-model.md. Innan du ändrar något här — läs det.

Varje canonical persona är ett *komplett paket*: id, label, beskrivning,
Schema.org audience-typ, probe-templates per värmedimension (handskrivna
för autentisk persona-vinkling), och default-kanaler för receptmotorn.

**Probe-templates:** 10 personor × 6 dimensioner × 2 vinklar (neutral +
adversarial) = 120 handskrivna prompts. Kalibrering är engångskostnad —
alla kunder får nytta. {company} är placeholdern som warmth_probes
substituerar vid körning.

**Default vid kund-onboarding:** personor med `is_default=True` (customer,
employee, investor) aktiveras automatiskt. Operatören kan toggla av/på
från resterande palett upp till totalt 5 aktiva.

**Nivå 2 (template-synlighet i UI):** seed_to_firestore() skriver paletten
till prompts/persona_templates så frontend kan rendera dem read-only.
Edits sker fortfarande här i Python — UI:t är informationsyta, inte
edit-yta (mätintegritet, se persona-model.md §"Nivåer av template-management").
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

log = logging.getLogger(__name__)


# Hård cap för antal aktiva personor per kund. Driver UI-validering och
# spärr i clients/{id}.personas-skrivpath. Cost-budget (Fas 1.6) biter
# om kund försöker bypassa via direkta probe-anrop.
MAX_ACTIVE_PERSONAS_PER_CLIENT: int = 5


@dataclass(frozen=True)
class CanonicalPersona:
    """Komplett persona-paket — namn + mätning + handling i ett objekt.

    probe_templates: dict[dimension_id, (neutral_q, adversarial_q)] — där
    dimension_id är slug från humanization_config.DIMENSIONS (inclusion,
    wellbeing, transparency, ethics, development, community).

    default_channels: rangordnade kanaler som receptmotorn (Lager A) väljer
    från när ett gap detekteras för denna persona. Strängar matchar
    konstanterna CHANNEL_* i services/gap_recipes.
    """
    id: str
    label_sv: str
    description_sv: str
    schema_audience_type: str
    probe_templates: dict[str, tuple[str, str]]
    default_channels: tuple[str, ...]
    is_default: bool


# --- Probe-templates per persona × dimension ---------------------------------
# Konvention: {company} substitueras vid probe-tid. Frågorna är vinklade så
# att en persona-grupp formulerar dem som de själva skulle gjort — annars
# fångar vi inte autentisk persona-uppfattning.


_CUSTOMER_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som potentiell kund, märker du om {company} prioriterar mångfald i hur de möter olika kundgrupper?",
        "Som potentiell kund, finns det signaler om att {company} missar eller särbehandlar vissa kundgrupper?",
    ),
    "wellbeing": (
        "Som potentiell kund, hur upplever du att {company} tar hand om både sina anställda och sina kunder?",
        "Som potentiell kund, finns det tecken på att överbelastad personal hos {company} sänker kundupplevelsen?",
    ),
    "transparency": (
        "Som potentiell kund, hur transparenta är {company} kring priser, leveranstider och förändringar?",
        "Som potentiell kund, finns det dolda kostnader, oklara villkor eller överraskningar man bör veta om hos {company}?",
    ),
    "ethics": (
        "Som potentiell kund, agerar {company} etiskt i sina affärer och i hur de behandlar kunder?",
        "Som potentiell kund, finns det rapporter om oetiska affärsmetoder eller dolda baksidor hos {company}?",
    ),
    "development": (
        "Som potentiell kund, hur aktivt investerar {company} i att förbättra sina produkter och möta nya behov?",
        "Som potentiell kund, känns {company} statiskt eller efter konkurrenterna när det gäller utveckling?",
    ),
    "community": (
        "Som potentiell kund, bidrar {company} till samhället på sätt som spelar roll för era val som kund?",
        "Som potentiell kund, känns {company}:s samhällsengagemang trovärdigt eller mest som PR-aktivitet?",
    ),
}


_EMPLOYEE_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som potentiell anställd, hur prioriterar {company} mångfald och inkludering i sin kultur?",
        "Som potentiell anställd, finns det varningssignaler om exkludering eller en dominerande monokultur hos {company}?",
    ),
    "wellbeing": (
        "Som potentiell anställd, hur tar {company} hand om personalens välmående och arbetsmiljö?",
        "Som potentiell anställd, finns det signaler på hög personalomsättning, utbrändhet eller dålig arbetsmiljö hos {company}?",
    ),
    "transparency": (
        "Som potentiell anställd, hur transparenta är {company} kring lön, karriärvägar och kollektivavtal?",
        "Som potentiell anställd, finns det rykten om olikabehandling, dold lönediskriminering eller brist på kollektivavtal hos {company}?",
    ),
    "ethics": (
        "Som potentiell anställd, lever {company} efter sina värderingar i hur de behandlar personal och affärspartners?",
        "Som potentiell anställd, har {company} historik av oetiskt ledarskap, mobbning eller arbetsplatsskandaler?",
    ),
    "development": (
        "Som potentiell anställd, hur investerar {company} i sina anställdas utveckling och kompetens?",
        "Som potentiell anställd, är karriärutvecklingen begränsad, slumpvis eller utan tydlig struktur hos {company}?",
    ),
    "community": (
        "Som potentiell anställd, bidrar {company}:s arbete till något större än bara affärer?",
        "Som potentiell anställd, känns {company}:s samhällsbidrag som tomma ord eller äkta engagemang?",
    ),
}


_INVESTOR_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som investerare, hur ser {company}:s mångfaldsprofil ut i ledningsgrupp och styrelse?",
        "Som investerare, finns det governance-risker kopplade till bristande mångfald hos {company}?",
    ),
    "wellbeing": (
        "Som investerare, hur påverkar {company}:s arbetsmiljö och personalretention den långsiktiga lönsamheten?",
        "Som investerare, finns det HR-risker (höga omsättningssiffror, sjukfrånvaro) hos {company} som kan slå mot resultatet?",
    ),
    "transparency": (
        "Som investerare, hur transparenta är {company} i sin finansiella rapportering och styrning?",
        "Som investerare, finns det varningssignaler om dold skuld, otransparenta affärer eller bristande tillsyn hos {company}?",
    ),
    "ethics": (
        "Som investerare, vilken etisk profil och governance-kvalitet har {company}?",
        "Som investerare, har {company} ESG-risker, historik av regulatoriska sanktioner eller pågående utredningar?",
    ),
    "development": (
        "Som investerare, hur investerar {company} i innovation och långsiktig tillväxt?",
        "Som investerare, ligger {company} efter konkurrenterna i innovation, R&D eller marknadsexpansion?",
    ),
    "community": (
        "Som investerare, hur värdedrivande är {company}:s samhälls- och hållbarhetsengagemang?",
        "Som investerare, finns det reputational risks i hur {company} hanterar samhällsfrågor eller hållbarhet?",
    ),
}


_PARTNER_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som potentiell partner, hur arbetar {company} med mångfald hos sina samarbetspartners och leverantörer?",
        "Som potentiell partner, har {company} historik av att favorisera viss typ av partners eller utesluta andra?",
    ),
    "wellbeing": (
        "Som potentiell partner, hur ser personalstabiliteten ut hos {company} — påverkar det leveransförmågan?",
        "Som potentiell partner, riskerar interna problem hos {company} att skada gemensamma åtaganden?",
    ),
    "transparency": (
        "Som potentiell partner, hur tydliga är {company} med kontrakt, royalties och affärsvillkor?",
        "Som potentiell partner, finns det historik av oklarheter eller tvister i {company}:s partnerskap?",
    ),
    "ethics": (
        "Som potentiell partner, hur håller {company} sina åtaganden mot samarbetspartners?",
        "Som potentiell partner, finns det rapporter om missade åtaganden, kontraktsbrott eller oetiskt beteende från {company}?",
    ),
    "development": (
        "Som potentiell partner, hur utvecklar {company} sina partnerskap över tid?",
        "Som potentiell partner, känns {company}:s partner-engagemang transactionellt och kortsiktigt?",
    ),
    "community": (
        "Som potentiell partner, hur engagerar sig {company} i den bredare branschen och ekosystemet?",
        "Som potentiell partner, är {company} en isolerad aktör eller en ekosystem-byggare?",
    ),
}


_MEDIA_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som journalist, hur arbetar {company} med representation och mångfald i sin kommunikation och i sin organisation?",
        "Som journalist, finns det historik av oprecis, stereotyp eller exkluderande kommunikation från {company}?",
    ),
    "wellbeing": (
        "Som journalist, vad är den mediala bilden av arbetsmiljön på {company}?",
        "Som journalist, har {company} varit föremål för granskning kring arbetsmiljö, mobbning eller personalbehandling?",
    ),
    "transparency": (
        "Som journalist, hur tillgängliga är {company} för media och hur transparent kommunicerar de svåra ämnen?",
        "Som journalist, finns det historik av censur, hemlighetsmakeri eller PR-spinning från {company}?",
    ),
    "ethics": (
        "Som journalist, har {company} en historik av etiska skandaler, regulatoriska ärenden eller granskningar?",
        "Som journalist, har {company} mörkat eller minimerat negativa händelser i mediakontakter?",
    ),
    "development": (
        "Som journalist, vad gör {company} som är nytt, nyhetsvärt och berättarvärt?",
        "Som journalist, är {company} statiskt och utan story att berätta jämfört med konkurrenter?",
    ),
    "community": (
        "Som journalist, hur engagerar sig {company} i samhällsfrågor som är av allmänt intresse?",
        "Som journalist, finns det greenwashing eller PR-driven samhällskommunikation från {company}?",
    ),
}


_REGULATOR_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som tillsynsorgan, följer {company} regelverk kring mångfald och anti-diskriminering?",
        "Som tillsynsorgan, finns det öppna ärenden eller historik av brott mot likabehandlingslagstiftning från {company}?",
    ),
    "wellbeing": (
        "Som tillsynsorgan, följer {company} regelverk kring arbetsmiljö, arbetstid och psykosocial hälsa?",
        "Som tillsynsorgan, har {company} historik av arbetsmiljöanmärkningar, sanktioner eller olyckor?",
    ),
    "transparency": (
        "Som tillsynsorgan, hur uppfyller {company} sina rapporteringskrav och transparens-skyldigheter?",
        "Som tillsynsorgan, finns det öppna utredningar mot {company} kring rapporteringsbrister eller bristande tillgänglighet?",
    ),
    "ethics": (
        "Som tillsynsorgan, hur väl följer {company} regelverk inom sin bransch?",
        "Som tillsynsorgan, finns det historik av regelbrott, böter eller sanktioner mot {company}?",
    ),
    "development": (
        "Som tillsynsorgan, hur uppdaterad är {company} med kommande regelförändringar och branschstandarder?",
        "Som tillsynsorgan, riskerar {company} att hamna efter kommande regelverk eller standarder?",
    ),
    "community": (
        "Som tillsynsorgan, hur bidrar {company} till de samhällsmål som branschens regelverk är kopplade till?",
        "Som tillsynsorgan, motverkar {company}:s agerande de samhällsintressen som regelverken skyddar?",
    ),
}


_PATIENT_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som potentiell patient, möter {company} olika patientgrupper med samma kvalitet och respekt?",
        "Som potentiell patient, finns det varningssignaler om diskriminerande eller särbehandlande bemötande från {company}?",
    ),
    "wellbeing": (
        "Som potentiell patient, hur tar {company} hand om patientupplevelsen och välmående i vården?",
        "Som potentiell patient, finns det rapporter om bristande omhändertagande eller låg patientsäkerhet hos {company}?",
    ),
    "transparency": (
        "Som potentiell patient, hur transparenta är {company} kring behandlingsresultat, väntetider och risker?",
        "Som potentiell patient, finns det dolda kostnader, oklara behandlingsvillkor eller bristande information från {company}?",
    ),
    "ethics": (
        "Som potentiell patient, hur etisk är {company}:s vård- och informationspraxis?",
        "Som potentiell patient, finns det rapporter om över-behandling, fel-prioritering eller oetisk hantering från {company}?",
    ),
    "development": (
        "Som potentiell patient, hur investerar {company} i bättre behandlingsmetoder, teknik och evidensbaserad vård?",
        "Som potentiell patient, ligger {company} efter andra vårdgivare i metoder, utrustning eller forskningssamarbeten?",
    ),
    "community": (
        "Som potentiell patient, hur bidrar {company} till folkhälsa och samhällsmedicinsk forskning?",
        "Som potentiell patient, finns det signaler om att {company} prioriterar vinst över patientvärde och folkhälsa?",
    ),
}


_STUDENT_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som student eller sökande, hur arbetar {company} med mångfald bland studenter, fakultet och kursinnehåll?",
        "Som student eller sökande, finns det varningssignaler kring exkludering, glastak eller dominerande studentkultur hos {company}?",
    ),
    "wellbeing": (
        "Som student eller sökande, hur tar {company} hand om studenternas välmående, mental hälsa och studietakt?",
        "Som student eller sökande, finns det rapporter om hög stressnivå, dropouts eller bristande studentstöd hos {company}?",
    ),
    "transparency": (
        "Som student eller sökande, hur transparenta är {company} kring antagningskrav, examensgrad och kostnader?",
        "Som student eller sökande, finns det dolda avgifter, otydliga krav eller oklara löften från {company}?",
    ),
    "ethics": (
        "Som student eller sökande, agerar {company} etiskt i marknadsföring, antagning och betygsättning?",
        "Som student eller sökande, finns det rapporter om oetiska forsknings- eller utbildningspraxis från {company}?",
    ),
    "development": (
        "Som student eller sökande, hur väl förbereder {company} sina studenter för arbetsmarknad och fortsatt utveckling?",
        "Som student eller sökande, är {company}:s utbildningsinnehåll föråldrat eller frikopplat från praktikens behov?",
    ),
    "community": (
        "Som student eller sökande, hur engagerar sig {company} i samhället och hur bidrar utbildningen till bredare nytta?",
        "Som student eller sökande, är {company}:s alumninätverk och samhällskoppling tunt eller obefintligt?",
    ),
}


_DONOR_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som potentiell givare, hur når {company}:s verksamhet olika behovsgrupper rättvist?",
        "Som potentiell givare, finns det historik av missgynnande eller selektiv mottagning hos {company}?",
    ),
    "wellbeing": (
        "Som potentiell givare, hur tar {company} hand om sina volontärer, anställda och mottagare?",
        "Som potentiell givare, finns det rapporter om bristande omhändertagande eller arbetsmiljöproblem inom {company}?",
    ),
    "transparency": (
        "Som potentiell givare, hur transparenta är {company} kring hur pengarna används och redovisas?",
        "Som potentiell givare, finns det rapporter om att {company} har bristande redovisning, höga overhead-kostnader eller oklart kapitalanvändning?",
    ),
    "ethics": (
        "Som potentiell givare, agerar {company} etiskt i insamling, kommunikation och biståndsarbete?",
        "Som potentiell givare, har {company} historik av oetisk insamling, missbruk av medel eller skandaler?",
    ),
    "development": (
        "Som potentiell givare, hur utvecklar {company} sin verksamhet och får mer impact per insamlad krona?",
        "Som potentiell givare, ligger {company} efter andra organisationer i metoder, effektivitet eller impact-mätning?",
    ),
    "community": (
        "Som potentiell givare, hur skapar {company} verklig samhällsförändring och hur mäter de impact?",
        "Som potentiell givare, är {company}:s impact-rapportering oklar, överdriven eller utan trovärdig metodik?",
    ),
}


_CITIZEN_PROBES: dict[str, tuple[str, str]] = {
    "inclusion": (
        "Som medborgare, hur arbetar {company} med representation och inkludering av olika samhällsgrupper?",
        "Som medborgare, finns det rapporter om att {company} missar, missgynnar eller exkluderar vissa samhällsgrupper?",
    ),
    "wellbeing": (
        "Som medborgare, hur påverkar {company} samhällets välmående, miljö och folkhälsa?",
        "Som medborgare, finns det varningssignaler om att {company} orsakar miljö-, hälso- eller social skada?",
    ),
    "transparency": (
        "Som medborgare, hur öppna är {company} kring beslut, kostnader och konsekvenser för samhället?",
        "Som medborgare, finns det historik av hemlighetsmakeri, korrupt agerande eller bristande information från {company}?",
    ),
    "ethics": (
        "Som medborgare, agerar {company} etiskt i förhållande till samhället och dess intressen?",
        "Som medborgare, har {company} historik av aggressiv lobbyism, skatteundandragande eller annat ifrågasatt agerande?",
    ),
    "development": (
        "Som medborgare, hur bidrar {company}:s verksamhet till samhällets utveckling och välstånd?",
        "Som medborgare, finns det signaler om att {company} prioriterar egenintresse över bredare samhällsnytta?",
    ),
    "community": (
        "Som medborgare, hur engagerar sig {company} lokalt och i bredare samhällsfrågor?",
        "Som medborgare, är {company}:s samhällsengagemang äkta eller framtvingat av PR/regulatoriskt tryck?",
    ),
}


# --- Default-kanaler per persona (för receptmotorns Lager A) -----------------
# Kanal-konstanterna definieras i services/gap_recipes.CHANNEL_* — vi använder
# strängarna direkt här för att undvika cirkulär modulimport. Strängarna måste
# hållas i synk med gap_recipes-konstanterna.

_CH_ATTESTED = "attested_upload"
_CH_LINKEDIN = "linkedin"
_CH_RSS = "rss"
_CH_PRESS = "press"
_CH_WIKIPEDIA = "wikipedia"
_CH_GLASSDOOR = "glassdoor"
_CH_WEBSITE = "website"
_CH_GITHUB = "github"


# --- Paletten — 10 kuraterade personor ---------------------------------------

_REGISTRY: tuple[CanonicalPersona, ...] = (
    CanonicalPersona(
        id="customer",
        label_sv="Kund",
        description_sv="Köpare och beslutsfattare av era produkter eller tjänster.",
        schema_audience_type="Customer",
        probe_templates=_CUSTOMER_PROBES,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_RSS, _CH_ATTESTED),
        is_default=True,
    ),
    CanonicalPersona(
        id="talent",
        label_sv="Talang",
        description_sv="Talang-/employer-brand-målgruppen: nuvarande personal och potentiella sökande.",
        schema_audience_type="Employee",
        probe_templates=_EMPLOYEE_PROBES,
        default_channels=(_CH_GLASSDOOR, _CH_LINKEDIN, _CH_WEBSITE, _CH_ATTESTED),
        is_default=True,
    ),
    CanonicalPersona(
        id="investor",
        label_sv="Investerare",
        description_sv="Institutionella, privata och retail-investerare.",
        schema_audience_type="Investor",
        probe_templates=_INVESTOR_PROBES,
        default_channels=(_CH_PRESS, _CH_ATTESTED, _CH_WEBSITE),
        is_default=True,
    ),
    CanonicalPersona(
        id="partner",
        label_sv="Partner",
        description_sv="Återförsäljare, integratörer, leverantörer och samarbeten.",
        schema_audience_type="BusinessAudience",
        probe_templates=_PARTNER_PROBES,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_RSS, _CH_LINKEDIN),
        is_default=False,
    ),
    CanonicalPersona(
        id="media",
        label_sv="Media",
        description_sv="Journalister, branschanalytiker och bloggare.",
        schema_audience_type="MediaAudience",
        probe_templates=_MEDIA_PROBES,
        default_channels=(_CH_PRESS, _CH_RSS, _CH_ATTESTED, _CH_WIKIPEDIA),
        is_default=False,
    ),
    CanonicalPersona(
        id="regulator",
        label_sv="Myndighet",
        description_sv="Tillsynsorgan, revisorer och branschorgan.",
        schema_audience_type="GovernmentAudience",
        probe_templates=_REGULATOR_PROBES,
        default_channels=(_CH_ATTESTED, _CH_PRESS, _CH_WEBSITE),
        is_default=False,
    ),
    CanonicalPersona(
        id="patient",
        label_sv="Patient",
        description_sv="Personer som tar emot er vård eller behandling (vårdkontext).",
        schema_audience_type="Patient",
        probe_templates=_PATIENT_PROBES,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_ATTESTED),
        is_default=False,
    ),
    CanonicalPersona(
        id="student",
        label_sv="Student",
        description_sv="Sökande, nuvarande studenter och alumni (utbildningskontext).",
        schema_audience_type="EducationalAudience",
        probe_templates=_STUDENT_PROBES,
        default_channels=(_CH_WEBSITE, _CH_LINKEDIN, _CH_PRESS, _CH_ATTESTED),
        is_default=False,
    ),
    CanonicalPersona(
        id="donor",
        label_sv="Givare",
        description_sv="Filantropi, stiftelser och ideellt engagemang.",
        schema_audience_type="Donor",
        probe_templates=_DONOR_PROBES,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_ATTESTED),
        is_default=False,
    ),
    CanonicalPersona(
        id="citizen",
        label_sv="Medborgare",
        description_sv="Politiker, väljare och kommun-/regiondialog (offentlig sektor).",
        schema_audience_type="Citizen",
        probe_templates=_CITIZEN_PROBES,
        default_channels=(_CH_PRESS, _CH_WEBSITE, _CH_RSS, _CH_ATTESTED),
        is_default=False,
    ),
)


_BY_ID: dict[str, CanonicalPersona] = {p.id: p for p in _REGISTRY}


# --- Dimension → persona-relevans (Fas 2.1b) ---------------------------------
# Per värmedimension: vilka personor är claim på denna dimension *särskilt*
# relevanta för? Driver default-taggningen i persona_derivation.derive_claim_audience.
# Tom mängd = "ingen särskild persona" → claimet förblir evergreen (relevant för alla).
#
# Princip: lägg bara med personor där claim genuint flyttar nålen för denna persona.
# Inte alla — då blir audience-fältet bara brus och retrieval-relevansen försvinner.
# Justera när vi ser i UI:t att signal-densiteten är fel.
DIMENSION_PERSONA_RELEVANCE: dict[str, frozenset[str]] = {
    "inclusion": frozenset({"talent", "customer", "student", "patient", "citizen"}),
    "wellbeing": frozenset({"talent", "patient", "student", "investor"}),  # investor → HR-risk
    "transparency": frozenset({"investor", "regulator", "media", "customer", "partner"}),
    "ethics": frozenset({"investor", "regulator", "media", "customer", "partner", "donor"}),
    "development": frozenset({"talent", "student", "investor", "partner"}),
    "community": frozenset({"citizen", "donor", "customer", "media"}),
}


# --- Publikt API --------------------------------------------------------------


def all_personas() -> tuple[CanonicalPersona, ...]:
    """Hela palett — orderad enligt registret. Defaults först i sortordningen."""
    return _REGISTRY


def get(persona_id: str) -> CanonicalPersona:
    """Slå upp persona på id. KeyError om id saknas — vill inte tysta typos."""
    if persona_id not in _BY_ID:
        raise KeyError(f"Okänd persona: {persona_id!r}. Tillgängliga: {sorted(_BY_ID)}")
    return _BY_ID[persona_id]


def default_persona_ids() -> tuple[str, ...]:
    """Personor som aktiveras automatiskt vid kund-onboarding (customer/employee/investor)."""
    return tuple(p.id for p in _REGISTRY if p.is_default)


def is_valid(persona_id: str) -> bool:
    return persona_id in _BY_ID


def validate_active_set(persona_ids: Iterable[str]) -> list[str]:
    """Sanitera en föreslagen lista av aktiva personor. Tar bort okända, deduplicerar,
    kapar till MAX_ACTIVE_PERSONAS_PER_CLIENT. Aldrig en tom lista — minst en default
    om allt blir bortrensat.

    Returnerar den sanerade listan i registry-ordning (för UI-stabilitet)."""
    seen: set[str] = set()
    valid: list[str] = []
    for pid in persona_ids:
        if pid in _BY_ID and pid not in seen:
            seen.add(pid)
            valid.append(pid)
    if not valid:
        valid = list(default_persona_ids())
    if len(valid) > MAX_ACTIVE_PERSONAS_PER_CLIENT:
        valid = valid[:MAX_ACTIVE_PERSONAS_PER_CLIENT]
    # Sortera enligt registry-ordning för konsekvent UI-rendering.
    order = {p.id: i for i, p in enumerate(_REGISTRY)}
    return sorted(valid, key=lambda pid: order[pid])


def as_dicts() -> list[dict]:
    """Serialiserbar form för /api/persona-registry och Firestore-seed (Nivå 2)."""
    out: list[dict] = []
    for p in _REGISTRY:
        out.append({
            "id": p.id,
            "label_sv": p.label_sv,
            "description_sv": p.description_sv,
            "schema_audience_type": p.schema_audience_type,
            "is_default": p.is_default,
            "default_channels": list(p.default_channels),
            "probe_templates": {
                dim: {"neutral": neut, "adversarial": adv}
                for dim, (neut, adv) in p.probe_templates.items()
            },
        })
    return out


# --- Firestore-seed (Nivå 2: read-only synlighet i UI) -----------------------


def seed_to_firestore() -> dict[str, int]:
    """Skriv paletten till prompts/persona_templates så frontend kan rendera
    den read-only. Idempotent — varje run skriver över ett doc per persona-id.

    Returnerar antal personor skrivna + antal probe-templates totalt (för
    bootstrap-skript och drift-larm).

    Designval: vi seedar från PYTHON till Firestore, inte tvärtom. Källan
    av sanning är _REGISTRY här i kod — Firestore-doc:en är en spegel som
    UI:t läser. Edit i UI:t = ingen effekt (det är meningen). Vill man
    ändra templates: editera här, kör seed.
    """
    # Sen-import — undvik modul-nivå-beroende när jobs/scripts importerar oss.
    try:
        import firestore_client as fs
    except Exception as exc:  # noqa: BLE001 — seed får inte krascha jobs som importerar
        log.warning("seed_to_firestore: firestore_client otillgänglig: %s", exc)
        return {"personas_written": 0, "templates_written": 0}

    try:
        col = fs.persona_templates_col()
    except AttributeError:
        log.warning("seed_to_firestore: persona_templates_col saknas i firestore_client — bygg den i Fas 2.1a")
        return {"personas_written": 0, "templates_written": 0}

    written = 0
    template_count = 0
    for persona in _REGISTRY:
        payload = {
            "id": persona.id,
            "label_sv": persona.label_sv,
            "description_sv": persona.description_sv,
            "schema_audience_type": persona.schema_audience_type,
            "is_default": persona.is_default,
            "default_channels": list(persona.default_channels),
            "probe_templates": {
                dim: {"neutral": neut, "adversarial": adv}
                for dim, (neut, adv) in persona.probe_templates.items()
            },
            "source": "python_registry",
            "registry_version": "1.0",
        }
        try:
            col.document(persona.id).set(payload)
            written += 1
            template_count += len(persona.probe_templates) * 2
        except Exception as exc:  # noqa: BLE001
            log.warning("seed_to_firestore: kunde inte skriva %s: %s", persona.id, exc)
    log.info(
        "persona_registry seed: %d personor, %d templates till Firestore",
        written, template_count,
    )
    return {"personas_written": written, "templates_written": template_count}
