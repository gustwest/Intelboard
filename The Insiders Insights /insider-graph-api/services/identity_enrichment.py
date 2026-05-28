"""Lyft identitetsmetadata (logo + svenskt org.nr) från raw_items → client_doc.

Manuell input vinner alltid: skriver bara fält som idag är tomma på client_doc.
Varje skrivet värde får provenance (`<fält>_source` + `<fält>_set_at`) så UI:t
kan visa "auto-fyllt från website 2026-05-26" eller "manuellt satt 2026-05-27"
— ops ska aldrig undra var ett värde kom ifrån.

Auto-vägen körs efter att en scrape-körning persisterat sina raw_items (jobs/
scrape_website + jobs/scrape_active). Lift-only-vägen körs på begäran via
POST /clients/{id}/enrich-identity (knappen "Hämta automatiskt" i UI:t).
Idempotent — kan köras hur många gånger som helst utan biverkningar.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import firestore_client as fs
from services.discovery import _normalize_org_number

log = logging.getLogger(__name__)

# Källans raw_item.source → provenance-etikett i client_doc. Om en källa lyfter ett
# fält men inte finns med här loggas etiketten "auto" (defensiv default).
_SOURCE_LABELS: dict[str, str] = {
    "website": "website",  # og:image från crawlern
    "gleif": "gleif",      # entity.registeredAs från LEI-recordet
}

# raw_items.extra-fält → client_doc-fält. Order = prioritetsordning vid kollision.
_FIELDS: tuple[tuple[str, str], ...] = (
    ("logo_url", "logo_url"),
    ("org_number", "org_number"),
)


def apply_identity_metadata(client_id: str) -> dict[str, Any]:
    """Lyft första hittade extra-värdet till client_doc om manuell input saknas.

    Returnerar:
      {
        "updates": {<fält>: {"value": "...", "source": "website|gleif|auto", "set_at": "iso"}, ...},
        "no_data_for": [<fält> som vi försökte men inte hittade kandidat för],
      }

    UI:t använder båda: updates → "Vi hittade X från website", no_data_for → "Kör
    Uppdatera profil först — vi har inget material att läsa ur ännu". Fält som
    redan är manuellt/auto-satta listas inte alls (rörs ej, inget att kommunicera).
    """
    ref = fs.client_doc(client_id)
    snap = ref.get()
    if not snap.exists:
        return {"updates": {}, "no_data_for": []}
    data = snap.to_dict() or {}

    updates: dict[str, dict[str, str]] = {}
    no_data_for: list[str] = []
    persist: dict[str, Any] = {}
    now = datetime.now(timezone.utc).isoformat()

    for extra_key, doc_field in _FIELDS:
        if data.get(doc_field):
            continue  # redan satt (manuellt eller auto från tidigare körning) — rör inte
        candidate = _first_extra_value(client_id, extra_key)
        if candidate is None:
            no_data_for.append(doc_field)
            continue
        value, source = candidate
        if doc_field == "org_number":
            value = _normalize_org_number(value)
            if not value:
                no_data_for.append(doc_field)
                continue
        label = _SOURCE_LABELS.get(source, "auto")
        persist[doc_field] = value
        persist[f"{doc_field}_source"] = label
        persist[f"{doc_field}_set_at"] = now
        updates[doc_field] = {"value": value, "source": label, "set_at": now}

    if persist:
        ref.update(persist)
        log.info("identity-enrichment %s: %s", client_id, list(updates))
    return {"updates": updates, "no_data_for": no_data_for}


def _first_extra_value(client_id: str, key: str) -> tuple[str, str] | None:
    """Första icke-tomma extra[key] över raw_items_company. Returnerar (värde, källa)
    eller None. Källan kommer från raw_item.source ('website' / 'gleif' / …) så
    provenance-etiketten i client_doc är ärlig — vi gissar inte."""
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if not raw.get("included_in_output", True):
            continue
        value = (raw.get("extra") or {}).get(key)
        if isinstance(value, str) and value.strip():
            return value.strip(), raw.get("source") or "auto"
    return None
