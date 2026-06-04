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
from dataclasses import dataclass, field
from typing import Any, Iterator

import firestore_client as fs
from schema_org.claims import (
    culture_claims_from_esg,
    derive_culture_claims,
    derive_property_claims,
    derive_skill_claims,
)
from schema_org.urls import canonical_url, external_same_as
from schemas import Claim, ClaimSource

DEFAULT_MANUAL_LABEL = "uppgift från bolaget"
DEFAULT_ATTESTED_LABEL = "verifierad av Geogiraph"
ATTESTED_PUBLISHER = "Geogiraph"

# Källans raw-schema_type beskriver subjektet den gav, inte själva källdokumentet.
# Org/Person/JobPosting-källor är i praktiken webbsidor vi läst — JobPosting-TYPEN är
# reserverad för de dedikerade rollnoderna (#job-…), inte för källnoder (#src-…).
_PAGE_TYPES = {"Organization", "Person", "JobPosting"}


@dataclass
class Source:
    number: int          # fotnotsnummer (ordning för första förekomst)
    sid: str             # @id
    url: str | None
    date: str | None
    name: str | None
    schema_type: str
    attested: bool = False   # True → källa vi själva verifierar (sdPublisher=Geogiraph)


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


@dataclass
class Prose:
    statement: str
    footnotes: list[int] = field(default_factory=list)
    manual_label: str | None = None
    # Persona-relevans (Fas 2.1f) — union av sammanslagna claims audience-fält.
    audience: list[str] = field(default_factory=list)


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


def build_render_model(client_id: str) -> RenderModel:
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise KeyError(f"client not found: {client_id}")

    data = client.to_dict() or {}
    base = canonical_url(client_id, data.get("profile_base_url"))
    org_id = f"{base}#org"

    same_as = list(external_same_as(data))
    persons = [
        {
            "@type": "Person",
            "@id": f"{base}#person-{emp_id}",
            "name": emp.get("name"),
            "jobTitle": emp.get("title"),
            "worksFor": {"@id": org_id},
        }
        for emp_id, emp in fs.iter_employees(client_id)
    ]

    sources: dict[str, Source] = {}  # item_id → Source (bevarar ordning)
    facts: list[Fact] = []
    prose_by_key: dict[str, Prose] = {}  # normaliserad text → Prose (dedup, bevarar ordning)

    def resolve(src: ClaimSource) -> tuple[int | None, str | None]:
        """→ (fotnotsnummer för item-/attesterad källa, etikett för manuell källa)."""
        if src.kind == "manual":
            return None, (src.label or DEFAULT_MANUAL_LABEL)
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
                    name=src.label or DEFAULT_ATTESTED_LABEL,
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
        if existing.url:
            if existing.url not in same_as:
                same_as.append(existing.url)
        return existing.number, None

    for claim in _iter_output_claims(client_id):
        if claim.subject_ref != "org":
            continue  # MVP: medarbetar-claims projiceras inte ännu
        footnotes: list[int] = []
        manual_label: str | None = None
        for src in claim.source:
            number, label = resolve(src)
            if number is not None and number not in footnotes:
                footnotes.append(number)
            if label and manual_label is None:
                manual_label = label

        audience = list(getattr(claim, "audience", None) or [])
        if claim.claim_kind == "property" and claim.predicate:
            facts.append(Fact(claim.predicate, claim.value, claim.statement, footnotes,
                              manual_label, claim.confidence, audience))
        elif claim.claim_kind == "narrative" and claim.statement:
            _merge_prose(prose_by_key, claim.statement.strip(), footnotes, manual_label, audience)

    # Starkast bevisade fakta först. Stabil sortering → värden med samma vikt
    # behåller upptäcktsordningen. Avgör ordningen på t.ex. knowsAbout-listan
    # (aktiva/fullt bevisade kompetenser före avklingade) — vikten visas aldrig
    # som siffra, den styr bara prominensen.
    facts.sort(key=lambda f: f.confidence, reverse=True)

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
    )


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
    }
    if data.get("website"):
        # Canonical homepage. Snippet i kundens <head> delar samma `url` — så
        # motorerna ser ETT konsistent entitetskort var de än läser den.
        organization["url"] = data["website"]
    if data.get("logo_url"):
        # Schema.org Organization.logo accepterar URL eller ImageObject. URL räcker —
        # motorerna laddar den och bygger sina egna avatar-/knowledge-paneler.
        organization["logo"] = data["logo_url"]
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
    if model.description:
        organization["description"] = model.description
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
    for idx, entry in enumerate([*model.facts, *model.prose]):
        text = entry.statement or (
            f"{entry.predicate}: {entry.value}" if isinstance(entry, Fact) else ""
        )
        node: dict[str, Any] = {
            "@type": "Claim",
            "@id": f"{model.base}#claim-{idx}",
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
        faq_nodes.append({"@type": "FAQPage", "@id": f"{model.base}#faq", "mainEntity": main_entity})

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

    graph = [organization, *model.persons, *source_nodes, *claim_nodes, *faq_nodes, *job_nodes]
    return {"@context": "https://schema.org", "@graph": graph}


# predikat → (frågemall, svarsmall). {name} = bolaget, {value} = (sammanslaget) värde.
_FAQ_TEMPLATES: dict[str, tuple[str, str]] = {
    "foundingDate": ("När grundades {name}?", "{name} grundades {value}."),
    "address": ("Var har {name} sitt säte?", "{name} har sitt säte i {value}."),
    "knowsAbout": ("Vad är {name} verksamt inom?", "{name} är verksamt inom {value}."),
    "numberOfEmployees": ("Hur många anställda har {name}?", "{name} har {value} anställda."),
    "jobBenefits": ("Vilka förmåner erbjuder {name}?", "{name} erbjuder {value}."),
}
_FAQ_ORDER = ["foundingDate", "address", "knowsAbout", "numberOfEmployees", "jobBenefits"]


def build_faq(model: RenderModel) -> list[FaqEntry]:
    """Deterministiska Q&A ur claims — källförsedda (footnotes följer faktan/prosan)."""
    name = model.company_name or model.client_id
    entries: list[FaqEntry] = []

    if model.description:
        prose_fns = sorted({n for p in model.prose for n in p.footnotes})
        entries.append(FaqEntry(f"Vad gör {name}?", model.description, prose_fns))

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
        if predicate not in grouped or predicate not in _FAQ_TEMPLATES:
            continue
        q_tmpl, a_tmpl = _FAQ_TEMPLATES[predicate]
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
        if raw.get("review_status") == "rejected":
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
) -> None:
    """Slå ihop snarlika narrative-claims (samma normaliserade text) och förena källor.
    Audience-fältet unionas — ett sammanslaget påstående är relevant för alla personor
    som något av de ingående claims var taggat för."""
    key = _normalize(statement)
    audience = audience or []
    existing = bag.get(key)
    if existing is None:
        bag[key] = Prose(statement, list(footnotes), manual_label, list(audience))
        return
    for n in footnotes:
        if n not in existing.footnotes:
            existing.footnotes.append(n)
    if existing.manual_label is None and manual_label:
        existing.manual_label = manual_label
    for a in audience:
        if a not in existing.audience:
            existing.audience.append(a)


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
    return Source(
        number=number,
        sid=f"{base}#src-{src.item_id}",
        url=raw.get("url"),
        date=_iso(raw.get("published_at")),
        name=raw.get("name") or (raw.get("extra") or {}).get("name"),
        schema_type=raw.get("schema_type") or "CreativeWork",
    )


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
