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
from dataclasses import dataclass, field
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
    # F4b — engelska probe-varianter (mätspråk en). Tom dict = inga en-prober ännu →
    # probes_for() faller tillbaka till svenska med en varning. Författade för default-
    # personorna (customer/talent/investor); palett-personorna är en innehålls-uppföljning.
    probe_templates_en: dict[str, tuple[str, str]] = field(default_factory=dict)


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


# --- F4b: engelska probe-varianter (mätspråk en) -----------------------------
# Trogna översättningar av default-personornas svenska prober — samma neutral/
# adversariell parning och samma {company}-substitution. Geografin är implicit
# (kunden är densamma); proberna mäter perception, inte marknad. Aldrig poolat med
# svenska resultat (egna språk-nycklade warmth-/baseline-dokument).
_CUSTOMER_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective customer, do you notice whether {company} prioritises diversity in how they serve different customer groups?",
        "As a prospective customer, are there signals that {company} overlooks or treats certain customer groups unfairly?",
    ),
    "wellbeing": (
        "As a prospective customer, how well do you feel {company} looks after both its employees and its customers?",
        "As a prospective customer, are there signs that overstretched staff at {company} are degrading the customer experience?",
    ),
    "transparency": (
        "As a prospective customer, how transparent is {company} about pricing, delivery times and changes?",
        "As a prospective customer, are there hidden costs, unclear terms or surprises one should know about with {company}?",
    ),
    "ethics": (
        "As a prospective customer, does {company} act ethically in its business and in how it treats customers?",
        "As a prospective customer, are there reports of unethical business practices or hidden downsides at {company}?",
    ),
    "development": (
        "As a prospective customer, how actively does {company} invest in improving its products and meeting new needs?",
        "As a prospective customer, does {company} feel static or behind competitors when it comes to development?",
    ),
    "community": (
        "As a prospective customer, does {company} contribute to society in ways that matter to your choices as a customer?",
        "As a prospective customer, does {company}'s community engagement feel credible or mostly like PR?",
    ),
}

_EMPLOYEE_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective employee, how does {company} prioritise diversity and inclusion in its culture?",
        "As a prospective employee, are there warning signs of exclusion or a dominant monoculture at {company}?",
    ),
    "wellbeing": (
        "As a prospective employee, how does {company} look after staff wellbeing and the work environment?",
        "As a prospective employee, are there signals of high turnover, burnout or a poor work environment at {company}?",
    ),
    "transparency": (
        "As a prospective employee, how transparent is {company} about pay, career paths and collective agreements?",
        "As a prospective employee, are there rumours of unequal treatment, hidden pay discrimination or a lack of collective agreements at {company}?",
    ),
    "ethics": (
        "As a prospective employee, does {company} live by its values in how it treats staff and business partners?",
        "As a prospective employee, does {company} have a history of unethical leadership, bullying or workplace scandals?",
    ),
    "development": (
        "As a prospective employee, how does {company} invest in its employees' development and skills?",
        "As a prospective employee, is career development limited, ad hoc or without clear structure at {company}?",
    ),
    "community": (
        "As a prospective employee, does {company}'s work contribute to something larger than just business?",
        "As a prospective employee, does {company}'s community contribution feel like empty words or genuine engagement?",
    ),
}

_INVESTOR_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As an investor, what does {company}'s diversity profile look like in its management team and board?",
        "As an investor, are there governance risks tied to a lack of diversity at {company}?",
    ),
    "wellbeing": (
        "As an investor, how do {company}'s work environment and staff retention affect long-term profitability?",
        "As an investor, are there HR risks (high turnover, sick leave) at {company} that could hit results?",
    ),
    "transparency": (
        "As an investor, how transparent is {company} in its financial reporting and governance?",
        "As an investor, are there warning signs of hidden debt, opaque dealings or weak oversight at {company}?",
    ),
    "ethics": (
        "As an investor, what is {company}'s ethical profile and governance quality?",
        "As an investor, does {company} have ESG risks, a history of regulatory sanctions or ongoing investigations?",
    ),
    "development": (
        "As an investor, how does {company} invest in innovation and long-term growth?",
        "As an investor, is {company} behind competitors in innovation, R&D or market expansion?",
    ),
    "community": (
        "As an investor, how value-driving is {company}'s community and sustainability engagement?",
        "As an investor, are there reputational risks in how {company} handles societal issues or sustainability?",
    ),
}


_PARTNER_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective partner, how does {company} work with diversity among its partners and suppliers?",
        "As a prospective partner, does {company} have a history of favouring certain partners or excluding others?",
    ),
    "wellbeing": (
        "As a prospective partner, how stable is {company}'s workforce — does it affect their ability to deliver?",
        "As a prospective partner, could internal problems at {company} jeopardise joint commitments?",
    ),
    "transparency": (
        "As a prospective partner, how clear is {company} about contracts, royalties and commercial terms?",
        "As a prospective partner, is there a history of ambiguity or disputes in {company}'s partnerships?",
    ),
    "ethics": (
        "As a prospective partner, how well does {company} honour its commitments to partners?",
        "As a prospective partner, are there reports of missed commitments, breach of contract or unethical conduct by {company}?",
    ),
    "development": (
        "As a prospective partner, how does {company} grow its partnerships over time?",
        "As a prospective partner, does {company}'s partner engagement feel transactional and short-term?",
    ),
    "community": (
        "As a prospective partner, how does {company} engage with the wider industry and ecosystem?",
        "As a prospective partner, is {company} an isolated player or an ecosystem builder?",
    ),
}

_MEDIA_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a journalist, how does {company} handle representation and diversity in its communication and organisation?",
        "As a journalist, is there a history of inaccurate, stereotyped or exclusionary communication from {company}?",
    ),
    "wellbeing": (
        "As a journalist, what is the media picture of the work environment at {company}?",
        "As a journalist, has {company} been scrutinised over its work environment, bullying or staff treatment?",
    ),
    "transparency": (
        "As a journalist, how accessible is {company} to the media and how transparently does it communicate difficult topics?",
        "As a journalist, is there a history of censorship, secrecy or PR spin from {company}?",
    ),
    "ethics": (
        "As a journalist, does {company} have a history of ethical scandals, regulatory cases or investigations?",
        "As a journalist, has {company} covered up or downplayed negative events in its media contacts?",
    ),
    "development": (
        "As a journalist, what is {company} doing that is new, newsworthy and worth telling?",
        "As a journalist, is {company} static and without a story to tell compared with competitors?",
    ),
    "community": (
        "As a journalist, how does {company} engage with societal issues of public interest?",
        "As a journalist, is there greenwashing or PR-driven societal messaging from {company}?",
    ),
}

_REGULATOR_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a regulator, does {company} comply with rules on diversity and anti-discrimination?",
        "As a regulator, are there open cases or a history of breaches of equal-treatment law by {company}?",
    ),
    "wellbeing": (
        "As a regulator, does {company} comply with rules on work environment, working hours and psychosocial health?",
        "As a regulator, does {company} have a history of work-environment citations, sanctions or accidents?",
    ),
    "transparency": (
        "As a regulator, how well does {company} meet its reporting requirements and disclosure obligations?",
        "As a regulator, are there open investigations into {company} over reporting failures or lack of accessibility?",
    ),
    "ethics": (
        "As a regulator, how well does {company} comply with the rules of its industry?",
        "As a regulator, is there a history of rule-breaking, fines or sanctions against {company}?",
    ),
    "development": (
        "As a regulator, how up to date is {company} with upcoming regulatory changes and industry standards?",
        "As a regulator, does {company} risk falling behind upcoming regulations or standards?",
    ),
    "community": (
        "As a regulator, how does {company} contribute to the societal goals its industry's rules are tied to?",
        "As a regulator, does {company}'s conduct work against the public interests the rules protect?",
    ),
}

_PATIENT_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective patient, does {company} meet different patient groups with the same quality and respect?",
        "As a prospective patient, are there warning signs of discriminatory or unequal treatment from {company}?",
    ),
    "wellbeing": (
        "As a prospective patient, how does {company} look after the patient experience and wellbeing in care?",
        "As a prospective patient, are there reports of poor care or low patient safety at {company}?",
    ),
    "transparency": (
        "As a prospective patient, how transparent is {company} about treatment outcomes, waiting times and risks?",
        "As a prospective patient, are there hidden costs, unclear treatment terms or poor information from {company}?",
    ),
    "ethics": (
        "As a prospective patient, how ethical are {company}'s care and information practices?",
        "As a prospective patient, are there reports of over-treatment, mis-prioritisation or unethical handling by {company}?",
    ),
    "development": (
        "As a prospective patient, how does {company} invest in better treatments, technology and evidence-based care?",
        "As a prospective patient, is {company} behind other providers in methods, equipment or research collaboration?",
    ),
    "community": (
        "As a prospective patient, how does {company} contribute to public health and medical research?",
        "As a prospective patient, are there signals that {company} prioritises profit over patient value and public health?",
    ),
}

_STUDENT_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a student or applicant, how does {company} work with diversity among students, faculty and course content?",
        "As a student or applicant, are there warning signs of exclusion, glass ceilings or a dominant student culture at {company}?",
    ),
    "wellbeing": (
        "As a student or applicant, how does {company} look after students' wellbeing, mental health and pace of study?",
        "As a student or applicant, are there reports of high stress, dropouts or poor student support at {company}?",
    ),
    "transparency": (
        "As a student or applicant, how transparent is {company} about admission requirements, completion rates and costs?",
        "As a student or applicant, are there hidden fees, unclear requirements or vague promises from {company}?",
    ),
    "ethics": (
        "As a student or applicant, does {company} act ethically in marketing, admissions and grading?",
        "As a student or applicant, are there reports of unethical research or teaching practices at {company}?",
    ),
    "development": (
        "As a student or applicant, how well does {company} prepare its students for the job market and continued growth?",
        "As a student or applicant, is {company}'s course content outdated or disconnected from real-world needs?",
    ),
    "community": (
        "As a student or applicant, how does {company} engage with society and how does the education contribute to wider value?",
        "As a student or applicant, is {company}'s alumni network and societal connection thin or non-existent?",
    ),
}

_DONOR_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective donor, how does {company}'s work reach different groups in need fairly?",
        "As a prospective donor, is there a history of disadvantaging or selectively serving recipients at {company}?",
    ),
    "wellbeing": (
        "As a prospective donor, how does {company} look after its volunteers, staff and recipients?",
        "As a prospective donor, are there reports of poor care or work-environment problems within {company}?",
    ),
    "transparency": (
        "As a prospective donor, how transparent is {company} about how funds are used and accounted for?",
        "As a prospective donor, are there reports that {company} has poor accounting, high overhead costs or unclear use of capital?",
    ),
    "ethics": (
        "As a prospective donor, does {company} act ethically in fundraising, communication and aid work?",
        "As a prospective donor, does {company} have a history of unethical fundraising, misuse of funds or scandals?",
    ),
    "development": (
        "As a prospective donor, how does {company} develop its work to get more impact per krona raised?",
        "As a prospective donor, is {company} behind other organisations in methods, efficiency or impact measurement?",
    ),
    "community": (
        "As a prospective donor, how does {company} create real societal change and how does it measure impact?",
        "As a prospective donor, is {company}'s impact reporting unclear, exaggerated or without credible methodology?",
    ),
}

_CITIZEN_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a citizen, how does {company} work with representation and inclusion of different groups in society?",
        "As a citizen, are there reports that {company} overlooks, disadvantages or excludes certain groups in society?",
    ),
    "wellbeing": (
        "As a citizen, how does {company} affect society's wellbeing, environment and public health?",
        "As a citizen, are there warning signs that {company} causes environmental, health or social harm?",
    ),
    "transparency": (
        "As a citizen, how open is {company} about decisions, costs and consequences for society?",
        "As a citizen, is there a history of secrecy, corrupt conduct or poor information from {company}?",
    ),
    "ethics": (
        "As a citizen, does {company} act ethically in relation to society and its interests?",
        "As a citizen, does {company} have a history of aggressive lobbying, tax avoidance or other questionable conduct?",
    ),
    "development": (
        "As a citizen, how does {company}'s work contribute to society's development and prosperity?",
        "As a citizen, are there signals that {company} prioritises self-interest over broader public benefit?",
    ),
    "community": (
        "As a citizen, how does {company} engage locally and in broader societal issues?",
        "As a citizen, is {company}'s community engagement genuine or forced by PR/regulatory pressure?",
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


# --- F4b-content: engelska probe-varianter för palett-personorna -------------
# Trogna översättningar av de svenska paletten ovan — samma neutral/adversariell
# parning och {company}-substitution. Komplett en-täckning: alla 10 personor kan nu
# mätas på engelska utan att hoppas över.
_PARTNER_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective partner, how does {company} work with diversity among its partners and suppliers?",
        "As a prospective partner, does {company} have a history of favouring certain types of partners or excluding others?",
    ),
    "wellbeing": (
        "As a prospective partner, how stable is {company}'s workforce — does it affect their ability to deliver?",
        "As a prospective partner, do internal problems at {company} risk harming joint commitments?",
    ),
    "transparency": (
        "As a prospective partner, how clear is {company} about contracts, royalties and commercial terms?",
        "As a prospective partner, is there a history of ambiguities or disputes in {company}'s partnerships?",
    ),
    "ethics": (
        "As a prospective partner, how well does {company} honour its commitments to partners?",
        "As a prospective partner, are there reports of missed commitments, contract breaches or unethical behaviour by {company}?",
    ),
    "development": (
        "As a prospective partner, how does {company} develop its partnerships over time?",
        "As a prospective partner, does {company}'s partner engagement feel transactional and short-term?",
    ),
    "community": (
        "As a prospective partner, how does {company} engage with the wider industry and ecosystem?",
        "As a prospective partner, is {company} an isolated player or an ecosystem builder?",
    ),
}

_MEDIA_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a journalist, how does {company} handle representation and diversity in its communication and in its organisation?",
        "As a journalist, is there a history of imprecise, stereotyped or exclusionary communication from {company}?",
    ),
    "wellbeing": (
        "As a journalist, what is the media picture of the work environment at {company}?",
        "As a journalist, has {company} been scrutinised over its work environment, bullying or staff treatment?",
    ),
    "transparency": (
        "As a journalist, how accessible is {company} to media and how transparently do they communicate difficult topics?",
        "As a journalist, is there a history of censorship, secrecy or PR spin from {company}?",
    ),
    "ethics": (
        "As a journalist, does {company} have a history of ethical scandals, regulatory cases or investigations?",
        "As a journalist, has {company} covered up or downplayed negative events in its media contacts?",
    ),
    "development": (
        "As a journalist, what is {company} doing that is new, newsworthy and worth telling?",
        "As a journalist, is {company} static and without a story to tell compared with competitors?",
    ),
    "community": (
        "As a journalist, how does {company} engage with societal issues of public interest?",
        "As a journalist, is there greenwashing or PR-driven societal communication from {company}?",
    ),
}

_REGULATOR_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a regulator, does {company} comply with rules on diversity and anti-discrimination?",
        "As a regulator, are there open cases or a history of breaches of equal-treatment legislation by {company}?",
    ),
    "wellbeing": (
        "As a regulator, does {company} comply with rules on work environment, working hours and psychosocial health?",
        "As a regulator, does {company} have a history of work-environment remarks, sanctions or accidents?",
    ),
    "transparency": (
        "As a regulator, how well does {company} meet its reporting requirements and transparency obligations?",
        "As a regulator, are there open investigations into {company} over reporting failures or lack of disclosure?",
    ),
    "ethics": (
        "As a regulator, how well does {company} comply with the rules of its industry?",
        "As a regulator, is there a history of rule-breaking, fines or sanctions against {company}?",
    ),
    "development": (
        "As a regulator, how up to date is {company} with upcoming regulatory changes and industry standards?",
        "As a regulator, does {company} risk falling behind upcoming regulations or standards?",
    ),
    "community": (
        "As a regulator, how does {company} contribute to the societal goals its industry's rules are tied to?",
        "As a regulator, does {company}'s conduct work against the public interests the rules protect?",
    ),
}

_PATIENT_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective patient, does {company} meet different patient groups with the same quality and respect?",
        "As a prospective patient, are there warning signs of discriminatory or unequal treatment from {company}?",
    ),
    "wellbeing": (
        "As a prospective patient, how does {company} look after the patient experience and wellbeing in care?",
        "As a prospective patient, are there reports of poor care or low patient safety at {company}?",
    ),
    "transparency": (
        "As a prospective patient, how transparent is {company} about treatment outcomes, waiting times and risks?",
        "As a prospective patient, are there hidden costs, unclear treatment terms or lacking information from {company}?",
    ),
    "ethics": (
        "As a prospective patient, how ethical are {company}'s care and information practices?",
        "As a prospective patient, are there reports of over-treatment, mis-prioritisation or unethical handling by {company}?",
    ),
    "development": (
        "As a prospective patient, how does {company} invest in better treatment methods, technology and evidence-based care?",
        "As a prospective patient, is {company} behind other providers in methods, equipment or research collaborations?",
    ),
    "community": (
        "As a prospective patient, how does {company} contribute to public health and medical research?",
        "As a prospective patient, are there signals that {company} prioritises profit over patient value and public health?",
    ),
}

_STUDENT_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a student or applicant, how does {company} work with diversity among students, faculty and course content?",
        "As a student or applicant, are there warning signs of exclusion, glass ceilings or a dominant student culture at {company}?",
    ),
    "wellbeing": (
        "As a student or applicant, how does {company} look after students' wellbeing, mental health and study pace?",
        "As a student or applicant, are there reports of high stress levels, dropouts or lacking student support at {company}?",
    ),
    "transparency": (
        "As a student or applicant, how transparent is {company} about admission requirements, graduation rates and costs?",
        "As a student or applicant, are there hidden fees, unclear requirements or vague promises from {company}?",
    ),
    "ethics": (
        "As a student or applicant, does {company} act ethically in marketing, admissions and grading?",
        "As a student or applicant, are there reports of unethical research or teaching practices from {company}?",
    ),
    "development": (
        "As a student or applicant, how well does {company} prepare its students for the job market and continued growth?",
        "As a student or applicant, is {company}'s curriculum outdated or disconnected from real-world needs?",
    ),
    "community": (
        "As a student or applicant, how does {company} engage with society and how does the education contribute to wider benefit?",
        "As a student or applicant, is {company}'s alumni network and societal connection thin or non-existent?",
    ),
}

_DONOR_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a prospective donor, how does {company}'s work reach different groups in need fairly?",
        "As a prospective donor, is there a history of disadvantaging or selective recipient selection at {company}?",
    ),
    "wellbeing": (
        "As a prospective donor, how does {company} look after its volunteers, employees and beneficiaries?",
        "As a prospective donor, are there reports of poor care or work-environment problems within {company}?",
    ),
    "transparency": (
        "As a prospective donor, how transparent is {company} about how funds are used and accounted for?",
        "As a prospective donor, are there reports that {company} has poor accounting, high overhead costs or unclear use of capital?",
    ),
    "ethics": (
        "As a prospective donor, does {company} act ethically in fundraising, communication and aid work?",
        "As a prospective donor, does {company} have a history of unethical fundraising, misuse of funds or scandals?",
    ),
    "development": (
        "As a prospective donor, how does {company} develop its work to achieve more impact per donated krona?",
        "As a prospective donor, is {company} behind other organisations in methods, efficiency or impact measurement?",
    ),
    "community": (
        "As a prospective donor, how does {company} create real societal change and how do they measure impact?",
        "As a prospective donor, is {company}'s impact reporting unclear, exaggerated or without credible methodology?",
    ),
}

_CITIZEN_PROBES_EN: dict[str, tuple[str, str]] = {
    "inclusion": (
        "As a citizen, how does {company} work with representation and inclusion of different societal groups?",
        "As a citizen, are there reports that {company} overlooks, disadvantages or excludes certain societal groups?",
    ),
    "wellbeing": (
        "As a citizen, how does {company} affect society's wellbeing, the environment and public health?",
        "As a citizen, are there warning signs that {company} causes environmental, health or social harm?",
    ),
    "transparency": (
        "As a citizen, how open is {company} about decisions, costs and consequences for society?",
        "As a citizen, is there a history of secrecy, corrupt conduct or lacking information from {company}?",
    ),
    "ethics": (
        "As a citizen, does {company} act ethically in relation to society and its interests?",
        "As a citizen, does {company} have a history of aggressive lobbying, tax avoidance or other questionable conduct?",
    ),
    "development": (
        "As a citizen, how does {company}'s work contribute to society's development and prosperity?",
        "As a citizen, are there signals that {company} prioritises self-interest over wider societal benefit?",
    ),
    "community": (
        "As a citizen, how does {company} engage locally and in wider societal issues?",
        "As a citizen, is {company}'s community engagement genuine or forced by PR/regulatory pressure?",
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
        probe_templates_en=_CUSTOMER_PROBES_EN,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_RSS, _CH_ATTESTED),
        is_default=True,
    ),
    CanonicalPersona(
        id="talent",
        label_sv="Talang",
        description_sv="Talang-/employer-brand-målgruppen: nuvarande personal och potentiella sökande.",
        schema_audience_type="Employee",
        probe_templates=_EMPLOYEE_PROBES,
        probe_templates_en=_EMPLOYEE_PROBES_EN,
        default_channels=(_CH_GLASSDOOR, _CH_LINKEDIN, _CH_WEBSITE, _CH_ATTESTED),
        is_default=True,
    ),
    CanonicalPersona(
        id="investor",
        label_sv="Investerare",
        description_sv="Institutionella, privata och retail-investerare.",
        schema_audience_type="Investor",
        probe_templates=_INVESTOR_PROBES,
        probe_templates_en=_INVESTOR_PROBES_EN,
        default_channels=(_CH_PRESS, _CH_ATTESTED, _CH_WEBSITE),
        is_default=True,
    ),
    CanonicalPersona(
        id="partner",
        label_sv="Partner",
        description_sv="Återförsäljare, integratörer, leverantörer och samarbeten.",
        schema_audience_type="BusinessAudience",
        probe_templates=_PARTNER_PROBES,
        probe_templates_en=_PARTNER_PROBES_EN,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_RSS, _CH_LINKEDIN),
        is_default=False,
    ),
    CanonicalPersona(
        id="media",
        label_sv="Media",
        description_sv="Journalister, branschanalytiker och bloggare.",
        schema_audience_type="MediaAudience",
        probe_templates=_MEDIA_PROBES,
        probe_templates_en=_MEDIA_PROBES_EN,
        default_channels=(_CH_PRESS, _CH_RSS, _CH_ATTESTED, _CH_WIKIPEDIA),
        is_default=False,
    ),
    CanonicalPersona(
        id="regulator",
        label_sv="Myndighet",
        description_sv="Tillsynsorgan, revisorer och branschorgan.",
        schema_audience_type="GovernmentAudience",
        probe_templates=_REGULATOR_PROBES,
        probe_templates_en=_REGULATOR_PROBES_EN,
        default_channels=(_CH_ATTESTED, _CH_PRESS, _CH_WEBSITE),
        is_default=False,
    ),
    CanonicalPersona(
        id="patient",
        label_sv="Patient",
        description_sv="Personer som tar emot er vård eller behandling (vårdkontext).",
        schema_audience_type="Patient",
        probe_templates=_PATIENT_PROBES,
        probe_templates_en=_PATIENT_PROBES_EN,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_ATTESTED),
        is_default=False,
    ),
    CanonicalPersona(
        id="student",
        label_sv="Student",
        description_sv="Sökande, nuvarande studenter och alumni (utbildningskontext).",
        schema_audience_type="EducationalAudience",
        probe_templates=_STUDENT_PROBES,
        probe_templates_en=_STUDENT_PROBES_EN,
        default_channels=(_CH_WEBSITE, _CH_LINKEDIN, _CH_PRESS, _CH_ATTESTED),
        is_default=False,
    ),
    CanonicalPersona(
        id="donor",
        label_sv="Givare",
        description_sv="Filantropi, stiftelser och ideellt engagemang.",
        schema_audience_type="Donor",
        probe_templates=_DONOR_PROBES,
        probe_templates_en=_DONOR_PROBES_EN,
        default_channels=(_CH_WEBSITE, _CH_PRESS, _CH_ATTESTED),
        is_default=False,
    ),
    CanonicalPersona(
        id="citizen",
        label_sv="Medborgare",
        description_sv="Politiker, väljare och kommun-/regiondialog (offentlig sektor).",
        schema_audience_type="Citizen",
        probe_templates=_CITIZEN_PROBES,
        probe_templates_en=_CITIZEN_PROBES_EN,
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


# --- Predikat → persona-relevans för OPERATIONELLA claims (A1, Fas 2-utökning 2026-06-12)
# Tidigare taggades BARA värme-/kultur-claims (via dimension) — alla operationella
# fakta blev evergreen och nådde aldrig persona-sektionerna. Den här kartan öppnar
# grinden för property-claims (företagsfakta + connector-claims) så t.ex. ett
# finansiellt claim landar i investor-sektionen. Samma precision-före-recall-princip
# som DIMENSION_PERSONA_RELEVANCE: lägg bara med predikat som GENUINT flyttar nålen
# för personan — annars blir audience-fältet brus. Predikat utan kartläggning förblir
# evergreen. Connector-specifika predikat (revenue/contractAward/patent/climateTarget)
# läggs till när respektive connector (A4: Bolagsverket → TED → SBTi) byggs.
OPERATIONAL_PERSONA_RELEVANCE: dict[str, frozenset[str]] = {
    # Verksamhetsområde = kundens #1-fråga ("vad gör bolaget — kan de hjälpa mig?").
    # Avgränsat/lågt brus: bara den övergripande `industry`-knowsAbout (via
    # derive_property_claims) taggas — de granulära skill-claimen (derive_skill_claims,
    # ej wire:ad) förblir evergreen, så kund-sektionen får rubriken "vad vi gör", inte
    # en lista med alla kompetenser.
    "knowsAbout": frozenset({"customer"}),
    "jobBenefits": frozenset({"talent"}),
    "hasCredential": frozenset({"customer", "investor", "partner"}),
    "memberOf": frozenset({"talent", "regulator", "partner"}),
    "aggregateRating": frozenset({"talent", "investor"}),       # eNPS o.dyl. → HR-signal
    "numberOfEmployees": frozenset({"investor", "talent"}),
    # Finansiella nyckeltal (A6 / finans-connector) — verbatim-källförsedda.
    "revenue": frozenset({"investor"}),
    "foundingDate": frozenset({"investor"}),                    # stabilitet/historik
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


def probes_for(persona: CanonicalPersona, language: str = "sv") -> tuple[dict[str, tuple[str, str]], str]:
    """F4b: probe-templates på mätspråket + det EFFEKTIVA språket.

    Returnerar (templates, effective_language). För en utan författade en-prober
    faller vi tillbaka till svenska och signalerar det via effective_language="sv"
    så att anroparen kan logga/flagga (engelska warmth-resultat ska aldrig poolas
    med svenska — en fallback-persona hör hemma i sv-spåret)."""
    if language == "en" and persona.probe_templates_en:
        return persona.probe_templates_en, "en"
    return persona.probe_templates, "sv"


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
