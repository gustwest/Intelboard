"""Leverans-snuttar (docs/claims-provenance-spec.md §7) för kundens egen sajt.

Den stabila identitets-snutten: en minimal Organization-JSON-LD som klistras in
i kundens `<head>` *en gång*. Den delar `@id` med profilsidans org-nod (samma
entitet) och pekar via `sameAs` på profilsidan — där den fullständiga, färska
grafen bor. Statisk (ingen JS-injektion), så AI-crawlers läser den.
"""
from __future__ import annotations

import json

import firestore_client as fs
from schema_org.urls import canonical_url


def _base(client_id: str, data: dict) -> str:
    return canonical_url(client_id, data.get("profile_base_url"))


def render_identity_snippet(client_id: str) -> str:
    data = fs.client_doc(client_id).get().to_dict() or {}
    base = _base(client_id, data)
    url = data.get("website") or base
    same_as = [
        u
        for u in [base, data.get("company_linkedin_url"), data.get("website")]
        if u and u != url
    ]

    org: dict = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": f"{base}#org",
        "name": data.get("company_name"),
        "url": url,
    }
    if same_as:
        org["sameAs"] = same_as

    body = json.dumps(org, ensure_ascii=False, indent=2)
    return f'<script type="application/ld+json">\n{body}\n</script>'
