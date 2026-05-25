"""Kompilerar Firestore-state till en JSON-LD-graf per kund.

Output följer Schema.org. Organization är rotnod, allt annat binds via @id.
Sociala mätvärden (följare, likes) inkluderas ALDRIG — de lever bara i
Firestore som baseline.
"""
from typing import Any

import firestore_client as fs


def compile_client(client_id: str) -> dict[str, Any]:
    client = fs.client_doc(client_id).get()
    if not client.exists:
        raise KeyError(f"client not found: {client_id}")

    data = client.to_dict() or {}
    org_id = f"https://insidergraph.io/clients/{client_id}#org"

    organization: dict[str, Any] = {
        "@type": "Organization",
        "@id": org_id,
        "name": data.get("company_name"),
        "description": data.get("about"),
        "foundingDate": data.get("founding_date"),
        "knowsAbout": data.get("expertise", []),
        "employee": [],
        "subjectOf": [],
    }

    for employee_id, emp in fs.iter_employees(client_id):
        person_id = f"{org_id}/employees/{employee_id}"
        person = {
            "@type": "Person",
            "@id": person_id,
            "name": emp.get("name"),
            "jobTitle": emp.get("title"),
            "worksFor": {"@id": org_id},
            "knowsAbout": emp.get("expertise", []),
            "alumniOf": [{"@type": "Organization", "name": school} for school in emp.get("education", [])],
        }
        organization["employee"].append(person)

        for item in fs.raw_items_col(client_id, employee_id).stream():
            raw = item.to_dict() or {}
            if not raw.get("included_in_output", True):
                continue
            organization["subjectOf"].append(
                {
                    "@type": raw.get("schema_type", "CreativeWork"),
                    "name": raw.get("name"),
                    "author": {"@id": person_id},
                    "datePublished": _iso(raw.get("published_at")),
                    "articleBody": raw.get("content"),
                    "url": raw.get("url"),
                }
            )

    for item in fs.raw_items_company_col(client_id).stream():
        raw = item.to_dict() or {}
        if not raw.get("included_in_output", True):
            continue
        if raw.get("schema_type") == "Organization":
            # Företagsnivå-källor (LinkedIn-företagssida, Bolagsverket) beskriver
            # kunden själv → berika rotnoden istället för att skapa subOrganization.
            _merge_company_org(organization, raw)
            continue
        organization["subjectOf"].append(
            {
                "@type": raw.get("schema_type", "CreativeWork"),
                "name": raw.get("name"),
                "datePublished": _iso(raw.get("published_at")),
                "articleBody": raw.get("content"),
                "url": raw.get("url"),
            }
        )

    return {
        "@context": "https://schema.org",
        "@graph": [organization],
    }


def _merge_company_org(organization: dict[str, Any], raw: dict[str, Any]) -> None:
    """Fyll tomma fält på rot-Organization från en företagsnivå-källa.

    Kurerade värden från klientdokumentet vinner alltid; connector-data fyller
    bara luckor. `name` lämnas orört (sätts alltid från company_name).
    """
    if not organization.get("description") and raw.get("content"):
        organization["description"] = raw["content"]
    if not organization.get("foundingDate") and raw.get("founded"):
        organization["foundingDate"] = raw["founded"]

    industry = raw.get("industry")
    if industry:
        known = organization.setdefault("knowsAbout", [])
        if industry not in known:
            known.append(industry)

    address = raw.get("address") or raw.get("headquarters")
    if address and not organization.get("address"):
        organization["address"] = address

    url = raw.get("url")
    if url:
        same_as = organization.setdefault("sameAs", [])
        if url not in same_as:
            same_as.append(url)


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
