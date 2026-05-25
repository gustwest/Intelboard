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

from dataclasses import dataclass, field
from typing import Any, Iterator

import firestore_client as fs
from schema_org.claims import derive_property_claims
from schemas import Claim, ClaimSource

DEFAULT_BASE = "https://profiles.geogiraph.com"
DEFAULT_MANUAL_LABEL = "uppgift från bolaget"

# Källans raw-schema_type beskriver subjektet den gav, inte själva källdokumentet.
# Org/Person-källor är i praktiken webbsidor vi läst.
_PAGE_TYPES = {"Organization", "Person"}


@dataclass
class Source:
    number: int          # fotnotsnummer (ordning för första förekomst)
    sid: str             # @id
    url: str | None
    date: str | None
    name: str | None
    schema_type: str


@dataclass
class Fact:
    predicate: str
    value: Any
    statement: str | None
    footnotes: list[int] = field(default_factory=list)
    manual_label: str | None = None


@dataclass
class Prose:
    statement: str
    footnotes: list[int] = field(default_factory=list)
    manual_label: str | None = None


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


def build_render_model(client_id: str) -> RenderModel:
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise KeyError(f"client not found: {client_id}")

    data = client.to_dict() or {}
    base = (data.get("profile_base_url") or f"{DEFAULT_BASE}/{client_id}").rstrip("/")
    org_id = f"{base}#org"

    same_as = [u for u in [data.get("website"), data.get("company_linkedin_url")] if u]
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
    prose: list[Prose] = []

    def resolve(src: ClaimSource) -> tuple[int | None, str | None]:
        """→ (fotnotsnummer för item-källa, etikett för manuell källa)."""
        if src.kind == "manual":
            return None, (src.label or DEFAULT_MANUAL_LABEL)
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

        if claim.claim_kind == "property" and claim.predicate:
            facts.append(Fact(claim.predicate, claim.value, claim.statement, footnotes, manual_label))
        elif claim.claim_kind == "narrative" and claim.statement:
            prose.append(Prose(claim.statement.strip(), footnotes, manual_label))

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
    )


def compile_client(client_id: str) -> dict[str, Any]:
    """Render-modell → JSON-LD-graf (Organization + Person + källnoder + Claim-noder)."""
    model = build_render_model(client_id)
    by_number = {s.number: s for s in model.sources}

    organization: dict[str, Any] = {
        "@type": "Organization",
        "@id": model.org_id,
        "name": model.company_name,
    }
    for fact in model.facts:
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
        claim_nodes.append(node)

    graph = [organization, *model.persons, *source_nodes, *claim_nodes]
    return {"@context": "https://schema.org", "@graph": graph}


def _iter_output_claims(client_id: str) -> Iterator[Claim]:
    """Persisterade claims (godkända) + deterministiskt härledda property-claims."""
    for _claim_id, raw in fs.iter_claims(client_id):
        if not raw.get("included_in_output", True):
            continue
        if raw.get("review_status") == "rejected":
            continue
        yield Claim(**raw)
    yield from derive_property_claims(client_id)


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
