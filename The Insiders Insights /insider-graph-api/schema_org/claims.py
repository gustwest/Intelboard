"""Deterministisk härledning av property-claims ur connector-data.

Strukturerade fält från connectorerna (Bolagsverket, LinkedIn-företagssida) är
*sourcade by construction* — vet vi att `founded` kom från Bolagsverket är claimet
källförsett utan LLM. Den här modulen mappar `raw_item.extra` → property-claims.

Fritext (`content`: verksamhetsbeskrivning, about, inlägg) hanteras INTE här — den
kräver narrativ extraktion (se docs/claims-provenance-spec.md §5.2–5.3).

Sociala mätvärden (followers m.m.) mappas aldrig — de utelämnas helt enkelt.
"""
from __future__ import annotations

from typing import Any, Iterator

import firestore_client as fs
from schemas import Claim, ClaimSource

# extra-fält → (schema.org-predikat, visningstext-mall). Källfält som saknas
# i mappen ignoreras; followers/likes finns medvetet inte med.
_COMPANY_FIELD_MAP: dict[str, tuple[str, str]] = {
    "founded": ("foundingDate", "Grundat {value}"),
    "headquarters": ("address", "Säte: {value}"),
    "address": ("address", "Säte: {value}"),
    "industry": ("knowsAbout", "Verksam inom {value}"),
    "industries": ("knowsAbout", "Verksam inom {value}"),
    "org_number": ("identifier", "Organisationsnummer {value}"),
}


def derive_property_claims(client_id: str) -> Iterator[Claim]:
    """Yielda property-claims för företagsnivå ur godkända företags-raw_items."""
    for snap in fs.raw_items_company_col(client_id).stream():
        raw = snap.to_dict() or {}
        if not raw.get("included_in_output", True):
            continue
        source = ClaimSource(kind="item", item_id=snap.id, employee_id=None)
        extra = raw.get("extra") or {}
        for field, value in extra.items():
            mapping = _COMPANY_FIELD_MAP.get(field)
            if not mapping or value in (None, "", []):
                continue
            predicate, template = mapping
            yield Claim(
                claim_kind="property",
                subject_ref="org",
                predicate=predicate,
                value=value,
                statement=template.format(value=_display(value)),
                source=[source],
                confidence=1.0,
            )


def _display(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value)
    return str(value)
