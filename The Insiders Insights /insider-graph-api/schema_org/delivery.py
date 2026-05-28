"""Leverans-snuttar (docs/claims-provenance-spec.md §7) för kundens egen sajt.

Den stabila identitets-snutten: en minimal Organization-JSON-LD som klistras in
i kundens `<head>` *en gång*. Den delar `@id` med profilsidans org-nod (samma
entitet) och pekar via `sameAs` på profilsidan + via `subjectOf` på den
maskinläsbara grafen (schema.json) — så AI-motorer som inte följer sameAs ändå
hittar färska fakta. Statisk (ingen JS-injektion), så AI-crawlers läser den.

Snippet och kompilator härleds ur SAMMA render-modell (`build_render_model`) så
fält (name, description, sameAs, dateModified, leiCode) inte kan glida isär.
"""
from __future__ import annotations

import json

import firestore_client as fs
from schema_org.compiler import build_render_model
from schema_org.urls import cdn_url, external_same_as, served_url


def render_identity_snippet(client_id: str) -> str:
    model = build_render_model(client_id)
    data = fs.client_doc(client_id).get().to_dict() or {}
    website = data.get("website")

    org: dict = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": model.org_id,
        "name": model.company_name,
    }
    if website:
        org["url"] = website
    if model.description:
        org["description"] = model.description

    # leiCode/identifier lyfts ur fakta-noden — motorerna får en hård identifierare
    # direkt i snippet (annars måste de följa subjectOf eller crawla profilsidan).
    lei = next((f.value for f in model.facts if f.predicate == "leiCode"), None)
    if lei:
        org["leiCode"] = lei

    if model.last_updated:
        # Berättar för motorn vilken version av identitets-fakta som gäller.
        # Källornas senaste datum är vår bästa proxy för "när vet vi att detta stämde".
        org["dateModified"] = model.last_updated

    # sameAs: profilsidan (fetchbar färsk graf) + externa identitetslänkar (LinkedIn).
    # I path-style-läge är canonical_url-domänen aspirationell — utan served_url
    # här leder snippeten ingenstans. Filtrera bort url och @id (redan deklarerade).
    same_as_raw = [served_url(client_id), *external_same_as(data)]
    same_as = []
    for u in same_as_raw:
        if not u or u == website or u in same_as:
            continue
        same_as.append(u)
    if same_as:
        org["sameAs"] = same_as

    # mainEntityOfPage förankrar Organization till sidan den FAKTISKT ligger på
    # (kundens egen sajt). Schema.org-rekommendation för entiteter inbäddade i <head>.
    if website:
        org["mainEntityOfPage"] = {"@type": "WebPage", "@id": website}

    # subjectOf → maskinläsbara grafen. Starkare semantik än sameAs: "här finns
    # ett dokument OM den här entiteten", inte "samma entitet på annan plats".
    org["subjectOf"] = {
        "@type": "Dataset",
        "@id": cdn_url(client_id),
        "name": "Geogiraph AI-profil",
    }

    body = json.dumps(org, ensure_ascii=False, separators=(",", ":"))
    return f'<script type="application/ld+json">{body}</script>'
