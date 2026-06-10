"""Kundkontakter (N2) — härledning av primär/sekundär ur client-doc.

Kanonisk lagring är `contacts[]` ({email, name, role, is_primary}). Legacy
`contact_email`/`contact_name` speglar huvudkontakten (skrivs i routern) så äldre
läsare fungerar oförändrat; här migrerar vi även on-read om contacts[] saknas.

Huvudkontakten är `to` på utskick (kit + månadsmejl); sekundärkontakterna cc:as.
"""
from __future__ import annotations

from typing import Any


def all_contacts(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Kontaktlistan. Lagrad contacts[] om den finns; annars migrera-on-read en enda
    huvudkontakt ur legacy contact_email/contact_name (tom lista om ingen kontakt)."""
    contacts = data.get("contacts")
    if contacts:
        return contacts
    email = data.get("contact_email")
    if email:
        return [{"email": email, "name": data.get("contact_name"),
                 "role": None, "is_primary": True}]
    return []


def primary_email(data: dict[str, Any]) -> str | None:
    """Huvudkontaktens e-post (mottagare för kit + månadsmejl)."""
    for c in all_contacts(data):
        if c.get("is_primary") and c.get("email"):
            return c["email"]
    # Fallback: legacy-spegling (eller första kontakten om ingen markerad).
    if data.get("contact_email"):
        return data["contact_email"]
    contacts = all_contacts(data)
    return contacts[0]["email"] if contacts else None


def secondary_emails(data: dict[str, Any]) -> list[str]:
    """Övriga kontakter (cc på utskick) — exkl. huvudkontakten, deduperat (skiftläges-
    okänsligt), ordning bevarad."""
    prim = (primary_email(data) or "").lower()
    out: list[str] = []
    seen: set[str] = set()
    for c in all_contacts(data):
        e = (c.get("email") or "").strip()
        if not e or e.lower() == prim or e.lower() in seen:
            continue
        seen.add(e.lower())
        out.append(e)
    return out
