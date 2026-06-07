"""Leverans-snuttar (docs/claims-provenance-spec.md §7) för kundens egen sajt.

Den stabila identitets-snutten: en minimal Organization-JSON-LD som klistras in
i kundens `<head>` *en gång*. Den delar `@id` med profilsidans org-nod (samma
entitet) och pekar via `sameAs` på profilsidan + via `subjectOf` på den
maskinläsbara grafen (schema.json) — så AI-motorer som inte följer sameAs ändå
hittar färska fakta. Statisk (ingen JS-injektion), så AI-crawlers läser den.

REN STABIL IDENTITET: snutten bär BARA fält som inte driver med claims —
identitet (@id/name/url/logo/identifier/leiCode/sameAs) som klistras en gång och
aldrig rörs igen. Färska/claim-beroende fält (description, dateModified) bor
medvetet INTE här: de skulle frysa vid inklistring och dessutom bära in claims-
prosa på kundens egen sajt. All färskhet lever på den hostade grafen som
`subjectOf` pekar på — motorerna följer den för aktuellt innehåll.
"""
from __future__ import annotations

import json

import firestore_client as fs
from schema_org.compiler import build_render_model
from schema_org.urls import cdn_url, clean_logo_url, external_same_as, served_url


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
    logo = clean_logo_url(data.get("logo_url"), website)
    if logo:
        # Logo direkt i snippet → motorerna behöver inte gissa via favicon och bygger
        # genast en korrekt knowledge-panel/avatar. Samma garde som compilern: en
        # startsides-/icke-bild-URL klistras aldrig in som trasig avatar hos kunden.
        org["logo"] = logo

    # OBS: description bor MEDVETET inte här (se modul-docstring). Den är claim-
    # beroende och skulle (1) frysa vid inklistring och (2) bära in claims-/marknads-
    # prosa på kundens egen sajt. Färska beskrivningar lever på den hostade grafen.

    # Hårda identifierare direkt i snippet: motorerna behöver inte följa subjectOf
    # för att disambiguera bolaget. leiCode lyfts ur fakta (kommer via GLEIF-
    # connectorn); org.nr ligger på client_doc (manuell input eller framtida
    # GLEIF-local-identifier-auto-extraktion).
    lei = next((f.value for f in model.facts if f.predicate == "leiCode"), None)
    if lei:
        org["leiCode"] = lei
    if data.get("org_number"):
        org["identifier"] = [{
            "@type": "PropertyValue",
            "propertyID": "SE-orgnr",
            "value": data["org_number"],
        }]

    # OBS: dateModified bor inte heller här — en statisk snutt som klistras en gång
    # skulle frysa datumet och börja ljuga om färskheten. Versionen/färskheten lever
    # på den hostade grafen (subjectOf) som motorerna följer för aktuellt innehåll.

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
