"""Kompilerar Firestore-state till en JSON-LD-graf per kund.

Output följer Schema.org. Organization är rotnod, allt annat binds via @id.
Grafen projiceras ur **claims** (se docs/claims-provenance-spec.md):

  * `property`-claims fyller schema.org-egenskaper på subjektsnoden (konsumtion)
    OCH emitteras som Claim-noder med `isBasedOn` (proveniens).
  * `narrative`-claims blir Claim-noder med `isBasedOn` → källnod.
  * varje refererad källa blir en källnod (WebPage/CreativeWork) med url + datum.

Regeln "ingen källa → inget claim" upprätthålls vid skapandet av claims; här
litar vi på att persisterade claims redan har källa. Sociala mätvärden
(följare, likes) inkluderas ALDRIG.

`@id`-basen är konfigurerbar per kund via `profile_base_url` på klientdokumentet
(default = geogiraph-domänen). Det är så default/premium-hosting (§7) styrs.
"""
from typing import Any, Iterator

import firestore_client as fs
from schema_org.claims import derive_property_claims
from schemas import Claim, ClaimSource

DEFAULT_BASE = "https://profiles.geogiraph.com"

# Källans raw-schema_type beskriver subjektet den gav, inte själva källdokumentet.
# Org/Person-källor är i praktiken webbsidor vi läst.
_PAGE_TYPES = {"Organization", "Person"}


def compile_client(client_id: str) -> dict[str, Any]:
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise KeyError(f"client not found: {client_id}")

    data = client.to_dict() or {}
    base = (data.get("profile_base_url") or f"{DEFAULT_BASE}/{client_id}").rstrip("/")
    org_id = f"{base}#org"

    organization: dict[str, Any] = {
        "@type": "Organization",
        "@id": org_id,
        "name": data.get("company_name"),
    }
    # Default-tier: ankra mot geogiraph men knyt entiteten till bolagets egen sajt.
    same_as = [u for u in [data.get("website"), data.get("company_linkedin_url")] if u]

    # Subjektsnoder: organisationen + en Person per medarbetare (identitet).
    persons: dict[str, dict[str, Any]] = {}
    for emp_id, emp in fs.iter_employees(client_id):
        persons[emp_id] = {
            "@type": "Person",
            "@id": f"{base}#person-{emp_id}",
            "name": emp.get("name"),
            "jobTitle": emp.get("title"),
            "worksFor": {"@id": org_id},
        }

    def subject_node(ref: str) -> dict[str, Any] | None:
        return organization if ref == "org" else persons.get(ref)

    sources: dict[str, dict[str, Any]] = {}
    claim_nodes: list[dict[str, Any]] = []

    for idx, claim in enumerate(_iter_output_claims(client_id)):
        subject = subject_node(claim.subject_ref)
        if subject is None:
            continue

        based_on: list[dict[str, str]] = []
        for src in claim.source:
            node = _source_node(client_id, base, src, sources)
            if node is not None:
                based_on.append({"@id": node["@id"]})
                if claim.subject_ref == "org" and node.get("url"):
                    if node["url"] not in same_as:
                        same_as.append(node["url"])

        if claim.claim_kind == "property" and claim.predicate:
            _apply_property(subject, claim.predicate, claim.value)

        claim_node: dict[str, Any] = {
            "@type": "Claim",
            "@id": f"{base}#claim-{idx}",
            "text": claim.statement or f"{claim.predicate}: {claim.value}",
            "about": {"@id": subject["@id"]},
        }
        if based_on:
            claim_node["isBasedOn"] = based_on if len(based_on) > 1 else based_on[0]
        claim_nodes.append(claim_node)

    if same_as:
        organization["sameAs"] = same_as
    if sources:
        organization["subjectOf"] = [{"@id": n["@id"]} for n in sources.values()]

    graph: list[dict[str, Any]] = [organization, *persons.values(), *sources.values(), *claim_nodes]
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


def _source_node(
    client_id: str, base: str, src: ClaimSource, sources: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """Materialisera (och cachea) en källnod. Manuella källor har ingen nod —
    de saknar länkbart ursprung och renderas som etikett på profilsidan."""
    if src.kind != "item" or not src.item_id:
        return None
    if src.item_id in sources:
        return sources[src.item_id]

    snap = fs.raw_item_doc(client_id, src.employee_id, src.item_id).get()
    if not snap.exists:
        return None
    raw = snap.to_dict() or {}

    schema_type = raw.get("schema_type")
    node = {
        "@type": "WebPage" if schema_type in _PAGE_TYPES else (schema_type or "CreativeWork"),
        "@id": f"{base}#src-{src.item_id}",
        "url": raw.get("url"),
        "datePublished": _iso(raw.get("published_at")),
    }
    name = raw.get("name") or (raw.get("extra") or {}).get("name")
    if name:
        node["name"] = name
    node = {k: v for k, v in node.items() if v is not None}
    sources[src.item_id] = node
    return node


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
