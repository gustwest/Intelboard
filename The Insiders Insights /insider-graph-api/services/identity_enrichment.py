"""Lyft identitetsmetadata (logo + svenskt org.nr) från raw_items → client_doc.

Manuell input vinner alltid: skriver bara fält som idag är tomma på client_doc.
Tank-tomning sker via ops-UI (sätt logo_url/org_number till tom sträng → fältet
nollas → nästa scrape-körning auto-fyller igen). Det är vår "låt mig välja om"-
mekanism utan att vi behöver track:a auto-vs-manuellt-flagga.

Körs efter att en scrape-körning persisterat sina raw_items (jobs/scrape_website
och jobs/scrape_active). Idempotent — kan köras hur många gånger som helst utan
biverkningar förutom själva uppdateringen.
"""
from __future__ import annotations

import logging

import firestore_client as fs
from services.discovery import _normalize_org_number

log = logging.getLogger(__name__)

# Källans extra-fältnamn → client_doc-fält. Order = prioritetsordning vid kollision
# (men idag har vi 1:1 så det spelar ingen roll).
_FIELDS: tuple[tuple[str, str], ...] = (
    ("logo_url", "logo_url"),
    ("org_number", "org_number"),
)


def apply_identity_metadata(client_id: str) -> dict[str, str]:
    """Skriv över tomma identitetsfält på client_doc med första hittade värde i
    raw_items_company.extra. Returnerar {fält: värde} för vad som faktiskt skrevs."""
    ref = fs.client_doc(client_id)
    snap = ref.get()
    if not snap.exists:
        return {}
    data = snap.to_dict() or {}

    updates: dict[str, str] = {}
    for extra_key, doc_field in _FIELDS:
        if data.get(doc_field):
            continue  # manuellt satt eller redan auto-fyllt — rör inte
        value = _first_extra_value(client_id, extra_key)
        if not value:
            continue
        if doc_field == "org_number":
            value = _normalize_org_number(value)
            if not value:
                continue
        updates[doc_field] = value

    if updates:
        ref.update(updates)
        log.info("identity-enrichment %s: %s", client_id, list(updates))
    return updates


def _first_extra_value(client_id: str, key: str) -> str | None:
    """Första icke-tomma extra[key] över raw_items_company. Inkluderar bara items
    som faktiskt ska konsumeras (included_in_output)."""
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if not raw.get("included_in_output", True):
            continue
        value = (raw.get("extra") or {}).get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
