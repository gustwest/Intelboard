"""Kompilerar Firestore-state till en render-modell, och vidare till JSON-LD.

`build_render_model()` är den gemensamma mellanrepresentationen som *både*
JSON-LD-kompilatorn (`compile_client`) och den statiska profilsidan
(`schema_org/profile_page.py`) läser ur — så de kan aldrig säga olika saker.

Allt projiceras ur **claims** (se docs/claims-provenance-spec.md):

  * `property`-claims fyller schema.org-egenskaper (konsumtion) och visas i faktapanelen.
  * `narrative`-claims blir prosa + Claim-noder med `isBasedOn` → källnod.
  * varje refererad källa blir en numrerad källnod (WebPage/CreativeWork) med url + datum.

Regeln "ingen källa → inget claim" upprätthålls vid skapandet av claims. Manuella
källor saknar länkbar nod och bär i stället en etikett (default "uppgift från bolaget").
Sociala mätvärden (följare, likes) inkluderas ALDRIG.

`@id`-basen är konfigurerbar per kund via `profile_base_url` (default = geogiraph-
domänen). Det är så default/premium-hosting (§7) styrs.
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Iterator

import firestore_client as fs
from schema_org import i18n
from schema_org.claims import (
    culture_claims_from_esg,
    derive_culture_claims,
    derive_property_claims,
    derive_skill_claims,
)
from schema_org.urls import canonical_url, clean_logo_url, external_same_as, resolve_website
from schemas import Claim, ClaimSource
from services import claim_voice

log = logging.getLogger(__name__)

# Default-etiketter (sv) — i18n.strings(language) väljer rätt språk per kund (A1).
# Behålls som konstanter för bakåtkompatibilitet; värdena = sv-strängtabellen.
DEFAULT_MANUAL_LABEL = "uppgift från bolaget"
DEFAULT_ATTESTED_LABEL = "verifierad av Geogiraph"
ATTESTED_PUBLISHER = "Geogiraph"

# Geogiraph som bestyrkande part i ClaimReview-noderna (assurance-markup, "Bron #1").
# KONSTANT identitet, medvetet OBEROENDE av kundens profil-bas: den som går i god
# för ett claim är alltid samma juridiska entitet, var sidan än hostas. Det är detta
# som gör markup-en URL-agnostisk men URL-redo — när publik landning (Bron #2) byggs
# byter bara `model.base`, aldrig vem som intygar. @id är därför ett stabilt brand-IRI,
# inte härlett ur klientens bas.
GEOGIRAPH_REVIEWER_ID = "https://geogiraph.com/#org"

# assurance_level → (ratingValue, läsbart namn) på en 3-gradig skala (bestRating=3,
# worstRating=1). Ordningen är också styrkeordningen: när ett claim har flera källor
# med olika nivå väljs den starkaste (_strongest_assurance). Nivåerna speglar
# schemas.ASSURANCE_LEVELS / humanization-trust-gap-spec.md §7.
_ASSURANCE_RATING: dict[str, tuple[int, str]] = {
    "self_declared": (1, "Självdeklarerad"),
    "third_party_reviewed": (2, "Tredjepartsgranskad"),
    "independently_assured": (3, "Oberoende bestyrkt"),
}
_ASSURANCE_RANK = {level: value for level, (value, _name) in _ASSURANCE_RATING.items()}

# Källans raw-schema_type beskriver subjektet den gav, inte själva källdokumentet.
# Org/Person/JobPosting-källor är i praktiken webbsidor vi läst — JobPosting-TYPEN är
# reserverad för de dedikerade rollnoderna (#job-…), inte för källnoder (#src-…).
_PAGE_TYPES = {"Organization", "Person", "JobPosting"}

# sameAs = "samma entitet någon annanstans" — INTE en samling citat. Källtyper som är
# INNEHÅLL om bolaget (enskilda inlägg, artiklar) är inte identitetslänkar: deras URL:er
# hör hemma som numrerade källnoder (subjectOf/citation), aldrig i sameAs. Annars späder
# t.ex. 17 LinkedIn-inläggs-URL:er ut identitetssignalen. Identitetskällor (Organization-
# sidor, allabolag, attesterade företagsankare) passerar och hamnar i sameAs som förr.
_SAMEAS_EXCLUDED_TYPES = {"SocialMediaPosting", "Article", "NewsArticle", "BlogPosting"}


@dataclass
class Source:
    number: int          # fotnotsnummer (ordning för första förekomst)
    sid: str             # @id
    url: str | None
    date: str | None
    name: str | None
    schema_type: str
    attested: bool = False   # True → källa vi själva verifierar (sdPublisher=Geogiraph)
    # Kort ordagrant utdrag/citat ur källan (A2). Exponeras synligt inline på
    # profilsidan när det finns — inbäddade citat/siffror är den starkaste
    # citeringsspaken (deep research 2026-06-05). None = visa bara namn+datum.
    excerpt: str | None = None


@dataclass
class Fact:
    predicate: str
    value: Any
    statement: str | None
    footnotes: list[int] = field(default_factory=list)
    manual_label: str | None = None
    # Tillitsvikt (1.0 = fullt bevisad; lägre = avklingad kapacitet, spec §3.2).
    # Visas aldrig som siffra publikt — styr bara ordningen så starkast bevisade
    # värden hamnar först (prominens = signal för AI-motorer/llms.txt).
    confidence: float = 1.0
    # Persona-relevans (Fas 2.1f). Tom = evergreen (alla personor). Driver
    # Schema.org Audience-markup + llms.txt-sektionering.
    audience: list[str] = field(default_factory=list)
    # Bestyrkandenivå (Bron #1): starkaste assurance_level bland claimets källor +
    # verifieringsrecordet den kom ur. None = aldrig manuellt verifierad (auto-deriverade
    # connector/ESG-claims) → ingen ClaimReview emitteras. Se _strongest_assurance.
    assurance_level: str | None = None
    verification_id: str | None = None
    # Claim-nivå-citat (A2.1): footnotnummer → det VERIFIERADE verbatim-spann
    # (ClaimSource.quote, deterministiskt grindat av services/claim_grounding) som
    # stödjer JUST detta claims bruk av källan. Starkare än Source.excerpt (käll-nivå,
    # A2) → visas inline vid claimet. Tom = visa bara namn+datum.
    quotes: dict[int, str] = field(default_factory=dict)


@dataclass
class Prose:
    statement: str
    footnotes: list[int] = field(default_factory=list)
    manual_label: str | None = None
    # Persona-relevans (Fas 2.1f) — union av sammanslagna claims audience-fält.
    audience: list[str] = field(default_factory=list)
    # Bestyrkandenivå (Bron #1) — som Fact. Vid dedup av snarlika narrative-claims
    # behålls den starkaste nivån (se _merge_prose).
    assurance_level: str | None = None
    verification_id: str | None = None
    # Claim-nivå-citat (A2.1) — som Fact. Vid dedup unionas mappen (se _merge_prose).
    quotes: dict[int, str] = field(default_factory=dict)


@dataclass
class FaqEntry:
    question: str
    answer: str
    footnotes: list[int]


@dataclass
class JobPosting:
    """En aktiv platsannons (spec §1–§2). Stängda annonser blir INGEN JobPosting-nod —
    deras kompetenser klingar av till org-nivå knowsAbout (spec §3.1)."""

    node_id: str
    title: str | None
    skills: list[str]
    location: str | None
    url: str | None
    date: str | None


@dataclass
class PersonClaim:
    """R1: ett godkänt expertis-påstående om en namngiven person (subject_ref =
    employee_id) — blir en Claim-nod med about → Person-noden i grafen."""

    person_id: str  # @id för Person-noden
    statement: str
    footnotes: list[int]


@dataclass
class RenderModel:
    client_id: str
    base: str
    org_id: str
    company_name: str | None
    same_as: list[str]
    facts: list[Fact]
    prose: list[Prose]
    sources: list[Source]
    persons: list[dict[str, Any]]
    description: str | None
    last_updated: str | None
    job_postings: list[JobPosting] = field(default_factory=list)
    # R1: godkända person-expertis-påståenden (Claim-noder med about → Person).
    person_claims: list[PersonClaim] = field(default_factory=list)
    # Profilsidans språk (A1, BCP 47). Default sv. Väljer strängtabell + sätts som
    # html lang / inLanguage. Bärs på modellen så både compiler och profile_page
    # läser SAMMA språk.
    language: str = i18n.DEFAULT_LANG
    # Front-loadad, självständig ledmening (A3): "{namn} är verksamt inom … med säte
    # i … grundat …". Citerbar sammanfattning som motorerna lyfter ordagrant; renderas
    # överst på profilsidan (position bias) + som Organization.description. None om
    # varken verksamhets-fakta eller prosa finns att bygga den ur.
    lead: str | None = None


def build_render_model(client_id: str) -> RenderModel:
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise KeyError(f"client not found: {client_id}")

    data = client.to_dict() or {}
    language = data.get("language") or i18n.DEFAULT_LANG
    _loc = i18n.strings(language)
    base = canonical_url(client_id, data.get("profile_base_url"))
    org_id = f"{base}#org"

    same_as = list(external_same_as(data))
    # GDPR: opt-out gäller hela personens närvaro — en opt:ad medarbetare får ALDRIG en
    # Person-nod i den publika grafen (inte bara stoppad datainsamling). Nästa kompilering
    # efter opt-out tar bort noden.
    persons = [
        {
            "@type": "Person",
            "@id": f"{base}#person-{emp_id}",
            "name": emp.get("name"),
            "jobTitle": emp.get("title"),
            "worksFor": {"@id": org_id},
        }
        for emp_id, emp in fs.iter_employees(client_id)
        if not emp.get("opted_out")
    ]
    # R1: index för person-claims-projektionen. Bara icke-opt:ade finns här →
    # en opt:ad/raderad persons claims faller bort av sig själva nedan (GDPR).
    person_by_emp_id = {p["@id"].rsplit("#person-", 1)[1]: p for p in persons}
    person_claims: list[PersonClaim] = []

    sources: dict[str, Source] = {}  # item_id → Source (bevarar ordning)
    facts: list[Fact] = []
    prose_by_key: dict[str, Prose] = {}  # normaliserad text → Prose (dedup, bevarar ordning)

    def resolve(src: ClaimSource) -> tuple[int | None, str | None]:
        """→ (fotnotsnummer för item-/attesterad källa, etikett för manuell källa)."""
        if src.kind == "manual":
            return None, (src.label or _loc["manual_label"])
        if src.kind == "attested":
            # Attesterad källa: en riktig, numrerad källnod byggd ur ClaimSource-fälten
            # (inte ur ett raw_item). Bär label + datum; sdPublisher=Geogiraph i grafen.
            key = f"att:{src.label}|{src.attested_at}|{src.url}"
            existing = sources.get(key)
            if existing is None:
                digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
                existing = Source(
                    number=len(sources) + 1,
                    sid=f"{base}#src-att-{digest}",
                    url=src.url,
                    date=src.attested_at,
                    name=src.label or _loc["attested_label"],
                    schema_type="Dataset",
                    attested=True,
                )
                sources[key] = existing
            if existing.url and existing.url not in same_as:
                same_as.append(existing.url)
            return existing.number, None
        if not src.item_id:
            return None, None
        existing = sources.get(src.item_id)
        if existing is None:
            existing = _load_source(client_id, base, src, len(sources) + 1)
            if existing is None:
                return None, None
            sources[src.item_id] = existing
        # Bara identitetskällor i sameAs — innehåll (inlägg/artiklar) blir källnod, inte
        # identitetslänk. Citatet/källnoden byggs ändå (returnerar number nedan).
        if existing.url and existing.schema_type not in _SAMEAS_EXCLUDED_TYPES:
            if existing.url not in same_as:
                same_as.append(existing.url)
        return existing.number, None

    for claim in _iter_output_claims(client_id):
        if claim.subject_ref != "org":
            # R1: person-expertis (subject_ref = employee_id) projiceras på personens
            # Person-nod. Saknas noden (opt-out/raderad) → claimet publiceras aldrig.
            person_node = person_by_emp_id.get(claim.subject_ref)
            if person_node is not None:
                p_footnotes: list[int] = []
                for src in claim.source:
                    number, _label = resolve(src)
                    if number is not None and number not in p_footnotes:
                        p_footnotes.append(number)
                if claim.claim_kind == "property" and claim.predicate == "knowsAbout" and claim.value:
                    existing_ka = person_node.get("knowsAbout") or []
                    if claim.value not in existing_ka:
                        person_node["knowsAbout"] = [*existing_ka, claim.value]
                elif claim.claim_kind == "narrative" and claim.statement:
                    person_claims.append(PersonClaim(
                        person_id=person_node["@id"],
                        statement=claim.statement.strip(),
                        footnotes=sorted(p_footnotes),
                    ))
            continue
        footnotes: list[int] = []
        manual_label: str | None = None
        quotes: dict[int, str] = {}
        for src in claim.source:
            number, label = resolve(src)
            if number is not None and number not in footnotes:
                footnotes.append(number)
            # Claim-nivå-citat (A2.1): bevara källans verifierade verbatim-spann för
            # JUST detta claim, nyckla på footnotnumret (första spannet per källa vinner).
            if number is not None and number not in quotes:
                q = (getattr(src, "quote", None) or "").strip()
                if q:
                    quotes[number] = q
            if label and manual_label is None:
                manual_label = label

        audience = list(getattr(claim, "audience", None) or [])
        assurance_level, verification_id = _strongest_assurance(claim.source)
        if claim.claim_kind == "property" and claim.predicate:
            facts.append(Fact(claim.predicate, claim.value, claim.statement, footnotes,
                              manual_label, claim.confidence, audience,
                              assurance_level, verification_id, quotes))
        elif claim.claim_kind == "narrative" and claim.statement:
            statement = claim.statement.strip()
            # Undanta BARA attesterad demografi (andel av LinkedIn-följare/-besökare) —
            # legitim social proof. Markören "LinkedIn-följare"/"LinkedIn-sida" sätts av
            # demografi-templaterna (attested_ingest); attesterade people_bio-/övriga
            # claims med följar-skryt omfattas däremot av spärren.
            low = statement.lower()
            is_demographic = any(s.kind == "attested" for s in claim.source) and (
                "linkedin-följare" in low or "linkedin-sida" in low
            )
            # Social-metric-/fåfänge-läckage publiceras ALDRIG — sista spärren även för
            # redan lagrad data (recompile rensar live utan re-extraktion).
            if not is_demographic and claim_voice.mentions_social_metric(statement):
                continue
            # Neutralisera företagsröst (idempotent) så även äldre lagrade första-persons-
            # claims renderas i tredje person vid recompile — utan re-extraktion.
            statement = claim_voice.neutralize(statement, data.get("company_name") or client_id)
            _merge_prose(prose_by_key, statement, footnotes, manual_label,
                         audience, assurance_level, verification_id, quotes)

    # Starkast bevisade fakta först. Stabil sortering → värden med samma vikt
    # behåller upptäcktsordningen. Avgör ordningen på t.ex. knowsAbout-listan
    # (aktiva/fullt bevisade kompetenser före avklingade) — vikten visas aldrig
    # som siffra, den styr bara prominensen.
    facts.sort(key=lambda f: f.confidence, reverse=True)

    # Sanera knowsAbout: släng platshållar-/rubrik-läckage ("Aggregerade kompetenser"),
    # dedupa skiftlägesokänsligt och normalisera akronymer. Körs EFTER sorteringen så
    # den starkaste ytformen av en dubblett behålls. Påverkar både JSON-LD-arrayen och
    # ledmeningen (båda läser samma facts-lista).
    facts = _sanitize_knowsabout(facts)

    # Dedup: snarlika påståenden (samma normaliserade text) är sammanslagna; deras
    # källor är förenade → ett påstående som bekräftas av flera källor citerar alla.
    prose = list(prose_by_key.values())
    for p in prose:
        p.footnotes.sort()
    description = (". ".join(p.statement.rstrip(".") for p in prose) + ".") if prose else None
    ordered_sources = sorted(sources.values(), key=lambda s: s.number)
    last_updated = max((s.date for s in ordered_sources if s.date), default=None)

    return RenderModel(
        client_id=client_id,
        base=base,
        org_id=org_id,
        company_name=data.get("company_name"),
        same_as=same_as,
        facts=facts,
        prose=prose,
        sources=ordered_sources,
        persons=persons,
        description=description,
        last_updated=last_updated,
        job_postings=_gather_job_postings(client_id, base),
        person_claims=person_claims,
        language=language,
        lead=_build_lead(data.get("company_name") or client_id, facts, prose, language),
    )


def _build_lead(name: str, facts: list[Fact], prose: list[Prose], lang: str) -> str | None:
    """Front-loadad, självständig ledmening (A3) ur strukturerade fakta.

    Bygger "{namn} är verksamt inom {knowsAbout} med säte i {address}, grundat
    {foundingDate}." av de fakta som finns. Kräver knowsAbout som verb-ankare för
    grammatisk korrekthet — saknas det faller vi tillbaka på starkaste prosan (redan
    sorterad starkast först). None om varken finns. Mallen väljs per språk (A1).

    Aggregerar ALLA värden per predikat — knowsAbout kommer ofta som flera enkel-värda
    Fact (ett per skill ur derive_skill_claims), inte ett list-värt. Att bara ta det
    första (gammalt beteende) gav "verksamt inom AI" trots att grafen listar hela
    kompetensbredden. Verb-ankaret (knowsAbout) listar alla värden; säte/grundande är
    singulära → första värdet räcker (undviker "säte i Göteborg, Stockholm")."""
    by_pred: dict[str, list[Any]] = {}
    for f in facts:
        values = f.value if isinstance(f.value, list) else [f.value]
        bag = by_pred.setdefault(f.predicate, [])
        for v in values:
            if v not in bag:
                bag.append(v)

    loc = i18n.strings(lang)
    if "knowsAbout" in by_pred:
        activity = ", ".join(str(v) for v in by_pred["knowsAbout"])
        lead = loc["lead_activity"].format(name=name, value=activity)
        if "address" in by_pred:
            lead += loc["lead_location"].format(value=str(by_pred["address"][0]))
        if "foundingDate" in by_pred:
            lead += loc["lead_founded"].format(value=str(by_pred["foundingDate"][0]))
        return lead + "."
    return (prose[0].statement.rstrip(".") + ".") if prose else None


# Interna platshållar-/rubriketiketter som aldrig får läcka ut som en kompetens.
# (Formfältet i routers/linkedin.py heter "Aggregerade kompetenser" — den texten har
# i praktiken fastnat som ett knowsAbout-VÄRDE för en kund.) Normaliserad jämförelse.
_KNOWSABOUT_PLACEHOLDERS = {
    "kompetenser", "kompetens", "kompetensstatistik",
    "skills", "aggregated skills", "competencies", "färdigheter",
}


def _normalize_skill(value: Any) -> str:
    """Trimma + kollapsa blanksteg. Korta enkel-ord helt i bokstäver behandlas som
    akronymer och versaliseras (ai → AI, geo → GEO) så de dedupar mot varandra och
    läser proffsigt. Flerordsfraser ("Sales Management") lämnas orörda."""
    s = re.sub(r"\s+", " ", str(value)).strip()
    if s and " " not in s and len(s) <= 4 and s.isalpha():
        return s.upper()
    return s


def _is_knowsabout_placeholder(normalized_lower: str) -> bool:
    return (
        normalized_lower in _KNOWSABOUT_PLACEHOLDERS
        or normalized_lower.startswith("aggregerad")  # "aggregerade kompetenser" m.fl.
    )


def _sanitize_knowsabout(facts: list[Fact]) -> list[Fact]:
    """Rensa knowsAbout-fakta: släng platshållar-/rubrik-läckage, dedupa skiftläges-
    okänsligt och normalisera akronymer. Övriga predikat passerar orörda. Ett faktum
    vars värden alla faller bort släpps helt. Drabbar även äldre Firestore-data vid
    nästa kompilering — ingen DB-kirurgi krävs."""
    seen: set[str] = set()
    out: list[Fact] = []
    for f in facts:
        if f.predicate != "knowsAbout":
            out.append(f)
            continue
        was_list = isinstance(f.value, list)
        values = f.value if was_list else [f.value]
        cleaned: list[str] = []
        for v in values:
            norm = _normalize_skill(v)
            key = norm.lower()
            if not norm or _is_knowsabout_placeholder(key) or key in seen:
                continue
            seen.add(key)
            cleaned.append(norm)
        if not cleaned:
            continue  # bara platshållare/dubbletter → släpp hela faktumet
        f.value = cleaned if was_list else cleaned[0]
        out.append(f)
    return out


def _gather_job_postings(client_id: str, base: str) -> list[JobPosting]:
    """Aktiva (ej stängda, ej generiska) platsannonser → JobPosting-vyer."""
    out: list[JobPosting] = []
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if raw.get("schema_type") != "JobPosting":
            continue
        if raw.get("closed_at") is not None:
            continue  # stängd → ingen nod (spec §3.1)
        if not raw.get("included_in_output", True) or raw.get("strategic") is False:
            continue
        extra = raw.get("extra") or {}
        out.append(
            JobPosting(
                node_id=f"{base}#job-{snap.id}",
                title=raw.get("global_title") or extra.get("name"),
                skills=raw.get("skills_enriched") or extra.get("skills") or [],
                location=extra.get("jobLocation"),
                url=raw.get("url"),
                date=_iso(raw.get("published_at")),
            )
        )
    return out


def compile_client(client_id: str) -> dict[str, Any]:
    """Render-modell → JSON-LD-graf (Organization + Person + källnoder + Claim-noder)."""
    model = build_render_model(client_id)
    by_number = {s.number: s for s in model.sources}

    data = fs.client_doc(client_id).get().to_dict() or {}
    organization: dict[str, Any] = {
        "@type": "Organization",
        "@id": model.org_id,
        "name": model.company_name,
        # Profilens språk (A1) på själva entiteten, inte bara på FAQPage — så motorerna
        # vet vilket språk fakta/beskrivning är skrivna på var de än läser noden.
        "inLanguage": model.language,
    }
    # Varumärkes-/kortnamn (t.ex. "The Insiders" för "The Insiders Hub AB") → alternateName
    # så motorerna konsoliderar de olika ytformerna till EN entitet i stället för att
    # splittra signalen. Källtexterna (LinkedIn/webb) använder ofta kortnamnet; utan detta
    # ankare läser motorn "The Insiders" och "The Insiders Hub AB" som potentiellt skilda.
    alt_names = [a for a in (data.get("alternate_names") or []) if isinstance(a, str) and a.strip()]
    if alt_names:
        # Dedupa mot det legala namnet (skiftlägesokänsligt) — ingen poäng att lista sig själv.
        legal = (model.company_name or "").strip().lower()
        alts = [a.strip() for a in alt_names if a.strip().lower() != legal]
        if alts:
            organization["alternateName"] = alts if len(alts) > 1 else alts[0]
    website = resolve_website(data)
    if website:
        # Canonical homepage. Snippet i kundens <head> delar samma `url` — så
        # motorerna ser ETT konsistent entitetskort var de än läser den.
        organization["url"] = website
    logo = clean_logo_url(data.get("logo_url"), data.get("website"))
    if logo:
        # Schema.org Organization.logo accepterar URL eller ImageObject. URL räcker —
        # motorerna laddar den och bygger sina egna avatar-/knowledge-paneler. Gardet
        # (clean_logo_url) stoppar startsides-/icke-bild-URL:er så ingen trasig avatar emittas.
        organization["logo"] = logo
    if data.get("org_number"):
        # Svenskt org.nr — PropertyValue med propertyID gör identifieraren entydig.
        # `identifier` är en lista i schema.org-modellen → vi initierar som lista även
        # om vi (idag) bara skickar ett värde, så framtida LEI/VAT enkelt läggs till.
        organization["identifier"] = [{
            "@type": "PropertyValue",
            "propertyID": "SE-orgnr",
            "value": data["org_number"],
        }]
    for fact in model.facts:
        if fact.predicate == "aggregateRating":
            # Medarbetaromdöme (eNPS o.dyl.) → riktig AggregateRating-nod, inte ett platt tal.
            organization["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": fact.value}
        elif fact.predicate == "memberOf" and isinstance(fact.value, str):
            # Kollektivavtal/motpart → Organization-referens (schema.org memberOf-typ).
            _apply_property(organization, "memberOf", {"@type": "Organization", "name": fact.value})
        else:
            _apply_property(organization, fact.predicate, fact.value)
    # Organization.description = aggregerad narrativ-prosa (rik, maskinläsbar). Den
    # front-loadade ledmeningen (A3) används för synlig ingress + meta/OG + llms-
    # summering på profilsidan, inte här — så JSON-LD-description behåller all prosa.
    if model.description:
        organization["description"] = model.description
    # Färskhetssignal (A5): dateModified = senaste källdatum, samma värde som den
    # synliga trust-raden ("senast uppdaterad …") — JSON-LD-färskheten matchar det
    # människor ser. Motorerna väger in recency; matchande datum bygger förtroende.
    if model.last_updated:
        organization["dateModified"] = model.last_updated
    if model.same_as:
        organization["sameAs"] = model.same_as
    if model.sources:
        organization["subjectOf"] = [{"@id": s.sid} for s in model.sources]

    source_nodes = [
        {
            k: v
            for k, v in {
                "@type": "WebPage" if s.schema_type in _PAGE_TYPES else (s.schema_type or "CreativeWork"),
                "@id": s.sid,
                "url": s.url,
                "datePublished": s.date,
                "name": s.name,
                # Attesterad källa: gör attesteringen maskinläsbar — Geogiraph är
                # den som går i god för (structured-data publisher).
                "sdPublisher": {"@type": "Organization", "name": ATTESTED_PUBLISHER} if s.attested else None,
            }.items()
            if v is not None
        }
        for s in model.sources
    ]

    claim_nodes: list[dict[str, Any]] = []
    review_nodes: list[dict[str, Any]] = []
    verif_cache: dict[str, dict[str, Any]] = {}
    for idx, entry in enumerate([*model.facts, *model.prose]):
        claim_id = f"{model.base}#claim-{idx}"
        text = entry.statement or (
            f"{entry.predicate}: {entry.value}" if isinstance(entry, Fact) else ""
        )
        node: dict[str, Any] = {
            "@type": "Claim",
            "@id": claim_id,
            "text": text,
            "about": {"@id": model.org_id},
        }
        based_on = [{"@id": by_number[n].sid} for n in entry.footnotes if n in by_number]
        if based_on:
            node["isBasedOn"] = based_on if len(based_on) > 1 else based_on[0]
        # Persona-relevans (Fas 2.1f): emittera Schema.org Audience-noder för claims
        # taggade med specifika personor. Tom audience = evergreen → ingen markup
        # (claimet gäller alla, ingen poäng att signalera en specifik publik).
        audience_nodes = _audience_markup(getattr(entry, "audience", None) or [])
        if audience_nodes:
            node["audience"] = audience_nodes if len(audience_nodes) > 1 else audience_nodes[0]
        claim_nodes.append(node)
        # Bestyrkande-markup (Bron #1): claims som gått igenom manuell Geogiraph-
        # verifiering bär en assurance_level → emittera en ClaimReview där Geogiraph
        # (konstant reviewer-IRI) går i god för claimet på 3-gradig skala. Auto-deriverade
        # claims saknar nivå och får ingen review. Compliance-stämpeln blir därmed
        # maskinläsbar utan att lämna pipelinen — samma data, ny utsignal.
        review = _claim_review(client_id, claim_id, idx, model.base, entry, verif_cache)
        if review is not None:
            review_nodes.append(review)

    # R1: person-expertis — godkända påståenden om namngivna personer blir Claim-noder
    # med about → Person-noden (inte org). Samma källförsedda form som org-claims.
    for i, pc in enumerate(model.person_claims):
        node = {
            "@type": "Claim",
            "@id": f"{model.base}#claim-person-{i}",
            "text": pc.statement,
            "about": {"@id": pc.person_id},
        }
        based_on = [{"@id": by_number[n].sid} for n in pc.footnotes if n in by_number]
        if based_on:
            node["isBasedOn"] = based_on if len(based_on) > 1 else based_on[0]
        claim_nodes.append(node)

    faq_nodes: list[dict[str, Any]] = []
    faq = build_faq(model)
    if faq:
        main_entity = []
        for entry in faq:
            answer: dict[str, Any] = {"@type": "Answer", "text": entry.answer}
            cites = [{"@id": by_number[n].sid} for n in entry.footnotes if n in by_number]
            if cites:
                answer["citation"] = cites if len(cites) > 1 else cites[0]
            main_entity.append({"@type": "Question", "name": entry.question, "acceptedAnswer": answer})
        faq_nodes.append({"@type": "FAQPage", "@id": f"{model.base}#faq",
                          "inLanguage": model.language, "mainEntity": main_entity})

    job_nodes: list[dict[str, Any]] = []
    for jp in model.job_postings:
        node: dict[str, Any] = {
            "@type": "JobPosting",
            "@id": jp.node_id,
            "hiringOrganization": {"@id": model.org_id},
        }
        if jp.title:
            node["title"] = jp.title
        if jp.skills:
            node["skills"] = jp.skills
        if jp.location:
            node["jobLocation"] = {"@type": "Place", "address": jp.location}
        if jp.date:
            node["datePosted"] = jp.date
        if jp.url:
            node["url"] = jp.url
        job_nodes.append(node)

    # ProfilePage-container (GEO-best practice): en uttrycklig sid-nod som säger "det
    # här dokumentet HANDLAR OM bolaget". Ger motorerna sid↔entitet-relationen explicit
    # i stället för att gissa, och bär sidans språk + färskhet.
    profile_page = {
        "@type": "ProfilePage",
        "@id": f"{model.base}#page",
        "url": model.base,
        "inLanguage": model.language,
        "about": {"@id": model.org_id},
        "mainEntity": {"@id": model.org_id},
    }
    if model.company_name:
        profile_page["name"] = model.company_name
    if model.last_updated:
        profile_page["dateModified"] = model.last_updated

    graph = [profile_page, organization, *model.persons, *source_nodes, *claim_nodes,
             *review_nodes, *faq_nodes, *job_nodes]
    return {"@context": "https://schema.org", "@graph": graph}


# Predikat-ordning i FAQ (språkneutral). Frågemallarna bor i i18n.strings(lang)["faq"]
# (A1). A6: FAQ-formatet är i sig ingen citeringsspak (deep research) — men en bra
# BÄRARE av tät, källförsedd text. Svaren ärver claimets footnotes så varje Q&A är källbelagt.
_FAQ_ORDER = ["foundingDate", "address", "knowsAbout", "numberOfEmployees",
              "jobBenefits", "slogan", "memberOf", "hasCredential"]


def build_faq(model: RenderModel) -> list[FaqEntry]:
    """Deterministiska Q&A ur claims — källförsedda (footnotes följer faktan/prosan).
    Frågemallar väljs per kundens språk (A1)."""
    loc = i18n.strings(model.language)
    faq_tmpl = loc["faq"]
    name = model.company_name or model.client_id
    entries: list[FaqEntry] = []

    if model.description:
        prose_fns = sorted({n for p in model.prose for n in p.footnotes})
        entries.append(FaqEntry(loc["faq_intro_q"].format(name=name), model.description, prose_fns))

    grouped: dict[str, dict[str, list]] = {}
    for fact in model.facts:
        g = grouped.setdefault(fact.predicate, {"values": [], "footnotes": []})
        for v in (fact.value if isinstance(fact.value, list) else [fact.value]):
            if v not in g["values"]:
                g["values"].append(v)
        for n in fact.footnotes:
            if n not in g["footnotes"]:
                g["footnotes"].append(n)

    for predicate in _FAQ_ORDER:
        if predicate not in grouped or predicate not in faq_tmpl:
            continue
        q_tmpl, a_tmpl = faq_tmpl[predicate]
        value = ", ".join(str(v) for v in grouped[predicate]["values"])
        entries.append(
            FaqEntry(q_tmpl.format(name=name), a_tmpl.format(name=name, value=value), sorted(grouped[predicate]["footnotes"]))
        )
    return entries


def _iter_output_claims(client_id: str) -> Iterator[Claim]:
    """Persisterade claims (godkända) + deterministiskt härledda property-claims."""
    for _claim_id, raw in fs.iter_claims(client_id):
        if not raw.get("included_in_output", True):
            continue
        # rejected = bortvald av granskare; aggregated = uppslukad av ett
        # narrative-claim (bevaras som evidens, renderas aldrig). Skippas oavsett
        # included_in_output — gammal data kan ha kvar flaggan truthy.
        if raw.get("review_status") in ("rejected", "aggregated"):
            continue
        # Inget claim utan källa (spec §2.2). Regeln gäller vid skapandet, men gammal/
        # manuellt skriven data kan ha tomt source[] med included_in_output=True. Sista
        # spärren vid kompilering: släpp claims utan proveniens så de aldrig når grafen
        # (drabbar även befintlig live-data vid nästa recompile — ingen DB-kirurgi krävs).
        if not (raw.get("source") or []):
            log.info("claim %s saknar källa — släpps (inget claim utan källa)", _claim_id)
            continue
        yield Claim(**raw)
    yield from derive_property_claims(client_id)
    yield from derive_skill_claims(client_id)
    # Humaniseringslager (§5.3): culture-taggade claims rider på samma maskineri —
    # property-claims (ethicsPolicy/diversityPolicy/slogan/knowsAbout/memberOf/jobBenefits/
    # hasCredential) blir org-egenskaper, ESG-återanvändning blir prosa.
    yield from derive_culture_claims(client_id)
    yield from culture_claims_from_esg(client_id)


def _apply_property(node: dict[str, Any], predicate: str, value: Any) -> None:
    """Sätt en schema.org-egenskap. Listvärden ackumuleras utan dubbletter."""
    existing = node.get(predicate)
    if existing is None:
        node[predicate] = value
        return
    bag = list(existing) if isinstance(existing, list) else [existing]
    incoming = value if isinstance(value, list) else [value]
    for v in incoming:
        if v not in bag:
            bag.append(v)
    node[predicate] = bag if len(bag) > 1 else bag[0]


def _merge_prose(
    bag: dict[str, "Prose"], statement: str, footnotes: list[int],
    manual_label: str | None, audience: list[str] | None = None,
    assurance_level: str | None = None, verification_id: str | None = None,
    quotes: dict[int, str] | None = None,
) -> None:
    """Slå ihop snarlika narrative-claims (samma normaliserade text) och förena källor.
    Audience-fältet unionas — ett sammanslaget påstående är relevant för alla personor
    som något av de ingående claims var taggat för. Bestyrkandenivån höjs till den
    starkaste av de sammanslagna claimen (Bron #1): bekräftar två källor samma utsaga
    och en är oberoende bestyrkt, ärver det förenade claimet den nivån."""
    key = _normalize(statement)
    audience = audience or []
    quotes = quotes or {}
    existing = bag.get(key)
    if existing is None:
        bag[key] = Prose(statement, list(footnotes), manual_label, list(audience),
                         assurance_level, verification_id, dict(quotes))
        return
    for n in footnotes:
        if n not in existing.footnotes:
            existing.footnotes.append(n)
    # Union av claim-nivå-citaten (A2.1): behåll första spannet per källa.
    for n, q in quotes.items():
        if n not in existing.quotes:
            existing.quotes[n] = q
    if existing.manual_label is None and manual_label:
        existing.manual_label = manual_label
    for a in audience:
        if a not in existing.audience:
            existing.audience.append(a)
    if _ASSURANCE_RANK.get(assurance_level, -1) > _ASSURANCE_RANK.get(existing.assurance_level, -1):
        existing.assurance_level = assurance_level
        existing.verification_id = verification_id


def _strongest_assurance(sources: list[ClaimSource]) -> tuple[str | None, str | None]:
    """Starkaste assurance_level bland claimets källor + det verification_id den kom ur.

    Ett claim kan ha flera källor (t.ex. dual-source). Bestyrkandet ska spegla det
    STARKASTE oberoende underlaget — en oberoende bestyrkt källa lyfter claimet även
    om en annan källa bara är självdeklarerad. Auto-deriverade claims (connector/ESG)
    saknar assurance_level helt → (None, None), ingen ClaimReview emitteras (§8: bara
    den manuella verifieringen sätter nivå)."""
    best_level: str | None = None
    best_rank = -1
    best_vid: str | None = None
    for src in sources:
        level = getattr(src, "assurance_level", None)
        if not level:
            continue
        rank = _ASSURANCE_RANK.get(level, -1)
        if rank > best_rank:
            best_rank, best_level = rank, level
            best_vid = getattr(src, "verification_id", None)
    return best_level, best_vid


def _claim_review(
    client_id: str, claim_id: str, idx: int, base: str,
    entry: "Fact | Prose", cache: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    """Bygg en schema.org ClaimReview-nod för ett bestyrkt claim (Bron #1), annars None.

    Geogiraph är `author` via ett KONSTANT IRI (URL-agnostiskt — se GEOGIRAPH_REVIEWER_ID).
    `reviewRating` bär assurance-nivån som maskinläsbart tal (1–3). Datum/text/utgång
    berikas ur Verification-recordet när det går att slå upp; faller annars tillbaka
    på vad ClaimSource redan bär. `reviewAspect="assurance"` gör tydligt att betyget
    avser bevisstyrka, inte sanningshalt."""
    level = getattr(entry, "assurance_level", None)
    rating = _ASSURANCE_RATING.get(level or "")
    if rating is None:
        return None
    rating_value, rating_name = rating
    review: dict[str, Any] = {
        "@type": "ClaimReview",
        "@id": f"{base}#review-{idx}",
        "itemReviewed": {"@id": claim_id},
        "author": {
            "@id": GEOGIRAPH_REVIEWER_ID,
            "@type": "Organization",
            "name": ATTESTED_PUBLISHER,
        },
        "reviewAspect": "assurance",
        "reviewRating": {
            "@type": "Rating",
            "ratingValue": rating_value,
            "bestRating": 3,
            "worstRating": 1,
            "alternateName": rating_name,
        },
    }
    fields = _verification_fields(client_id, getattr(entry, "verification_id", None), cache)
    if fields.get("date"):
        review["datePublished"] = fields["date"]
    if fields.get("text"):
        review["reviewBody"] = fields["text"]
    if fields.get("expires"):
        review["expires"] = fields["expires"]
    return review


def _verification_fields(
    client_id: str, verification_id: str | None, cache: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Hämta datum/text/utgång ur Verification-recordet (clients/{id}/verifications).
    Cachas per verification_id (flera claims kan dela samma verifiering). Saknat/oläsbart
    record → tom dict; ClaimReview byggs ändå ur assurance-nivån (graciös degradering)."""
    if not verification_id:
        return {}
    if verification_id in cache:
        return cache[verification_id]
    out: dict[str, Any] = {}
    try:
        snap = fs.verification_doc(client_id, verification_id).get()
        raw = snap.to_dict() if snap.exists else None
    except Exception:
        raw = None
    if raw:
        out = {
            "date": raw.get("verified_at"),
            "text": raw.get("verification_text"),
            "expires": raw.get("expires_at"),
        }
    cache[verification_id] = out
    return out


def _audience_markup(persona_ids: list[str]) -> list[dict[str, Any]]:
    """Bygg Schema.org Audience-noder från persona-id:n (Fas 2.1f).

    Slår upp audienceType + label i persona_registry. Okända id:n hoppas tyst
    över (registret är källan av sanning — ett claim taggat med en avregistrerad
    persona ska inte emittera trasig markup). Returnerar [] om inget giltigt.
    """
    from services import persona_registry as pr

    out: list[dict[str, Any]] = []
    for pid in persona_ids:
        try:
            persona = pr.get(pid)
        except KeyError:
            continue
        out.append({
            "@type": "Audience",
            "audienceType": persona.schema_audience_type,
            "name": persona.label_sv,
        })
    return out


def _normalize(text: str) -> str:
    """Normalisera för dedup-jämförelse: gemener, ihopslagna blanksteg, utan kantskiljetecken.
    Fångar exakta/nästan-exakta dubbletter; semantiska parafraser är medvetet utanför."""
    return " ".join(text.lower().split()).strip(" .,:;!?")


def _load_source(client_id: str, base: str, src: ClaimSource, number: int) -> Source | None:
    snap = fs.raw_item_doc(client_id, src.employee_id, src.item_id).get()
    if not snap.exists:
        return None
    raw = snap.to_dict() or {}
    extra = raw.get("extra") or {}
    return Source(
        number=number,
        sid=f"{base}#src-{src.item_id}",
        url=raw.get("url"),
        date=_iso(raw.get("published_at")),
        name=raw.get("name") or extra.get("name"),
        schema_type=raw.get("schema_type") or "CreativeWork",
        # Ordagrant utdrag om connectorn lagrat ett (A2). Faller tyst tillbaka på
        # namn+datum när det saknas — ingen regression för källor utan citat.
        excerpt=raw.get("excerpt") or extra.get("excerpt"),
    )


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
