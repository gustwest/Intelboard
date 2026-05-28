"""GLEIF-connector — global koncernstruktur via LEI (api.gleif.org).

GLEIF:s öppna API (ingen nyckel, ingen auth) ger Level 1 (legalt namn, adress,
registreringsstatus) och Level 2 (koncernrelationer). Vi modellerar *strukturen*
— moder-/dotterbolag som schema.org `parentOrganization`/`subOrganization` — inte
aggregerade mätvärden (följare, platsannonser). Strukturen ger AI-motorerna
entydig identitet (LEI) och länkade relationer; aggregat hör inte hemma här.

Kör på bolagsnivå, månadsvis. Saknar ett bolag Level 2-relationer (vanligt) är
det inte ett fel: relationsanropen ger 404 och vi returnerar ändå Level 1-datan.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem

log = logging.getLogger(__name__)

API_BASE = "https://api.gleif.org/api/v1"
# GLEIF följer JSON:API-specen.
HEADERS = {"Accept": "application/vnd.api+json"}
TIMEOUT = 20
# Skydd mot runaway-paginering vid stora koncerner (100 barn/sida).
MAX_CHILD_PAGES = 10


class GleifConnector(BaseConnector):
    id = "gleif"
    fetch_method = "api"
    output_types = ("Organization",)
    frequency = "monthly"
    tier = "standard"
    input_fields = (
        InputField(
            "lei",
            "LEI-kod",
            type="text",
            required=True,
            placeholder="5493001KJTIIGC8Y1R12",
            help="20-teckens Legal Entity Identifier. Slå upp den på search.gleif.org.",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        lei = (config.params.get("lei") or "").strip().upper()
        if not lei:
            return []

        level1 = _get_level1(lei)
        if level1 is None:
            return []  # okänd LEI eller temporärt fel → inget item

        extra: dict[str, Any] = {"name": level1["name"], "lei": lei}
        if level1.get("address"):
            extra["address"] = level1["address"]
        if level1.get("registration_status"):
            extra["registration_status"] = level1["registration_status"]
        if level1.get("registered_as"):
            # Lokal identifierare (svenska bolag: org.nr) — identity-enrichment
            # lyfter värdet till client_doc.org_number om manuell input saknas.
            extra["org_number"] = level1["registered_as"]

        parent = _get_parent(lei)
        if parent:
            extra["parent_organization"] = parent
        subsidiaries = _get_children(lei)
        if subsidiaries:
            extra["subsidiaries"] = subsidiaries

        return [
            RawItem(
                source="gleif",
                schema_type="Organization",
                content="",  # GLEIF ger strukturdata, ingen verksamhetstext
                url=f"https://search.gleif.org/#/record/{lei}",
                published_at=datetime.now(timezone.utc),
                extra=extra,
                item_id=f"gleif-{lei}",  # idempotent persist där jobbet stödjer det
            )
        ]


# --- GLEIF-anrop -----------------------------------------------------------


def _get(path: str, params: dict | None = None) -> dict | None:
    """GET mot GLEIF. 404 (saknad relation/okänd LEI) och temporära fel → None."""
    try:
        with httpx.Client(timeout=TIMEOUT, headers=HEADERS) as client:
            resp = client.get(f"{API_BASE}{path}", params=params)
    except httpx.HTTPError as exc:
        log.warning("gleif GET %s failed: %s", path, exc)
        return None
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        log.warning("gleif GET %s → %s", path, resp.status_code)
        return None
    try:
        return resp.json()
    except ValueError:
        log.warning("gleif GET %s → invalid JSON", path)
        return None


def _get_level1(lei: str) -> dict | None:
    payload = _get(f"/lei-records/{lei}")
    if not payload or not isinstance(payload.get("data"), dict):
        return None
    attrs = payload["data"].get("attributes") or {}
    entity = attrs.get("entity") or {}
    return {
        "name": _legal_name(entity),
        "address": _format_address(entity.get("legalAddress") or {}),
        "registration_status": (attrs.get("registration") or {}).get("status"),
        # Lokal registrerings-identifierare (svenska bolag: org.nr från Bolagsverket).
        # Saknas för bolag där GLEIF inte exponerar den → None, ingen fallback.
        "registered_as": _local_identifier(entity, attrs.get("registration") or {}),
    }


def _local_identifier(entity: dict, registration: dict) -> str | None:
    """Lokal registreringsidentifierare ur GLEIF. Två fält kan bära den:
    `entity.registeredAs` (vanligt) och `registration.otherValidationAuthorities`
    (fallback). Tar första icke-tomma sträng som finns."""
    raw = entity.get("registeredAs")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    for entry in registration.get("otherValidationAuthorities") or []:
        candidate = entry.get("validationAuthorityEntityID") if isinstance(entry, dict) else None
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _get_parent(lei: str) -> dict | None:
    """Direkt moderbolag (Level 2). 404 = bolaget rapporterar ingen moder."""
    payload = _get(f"/lei-records/{lei}/direct-parent")
    if not payload or not isinstance(payload.get("data"), dict):
        return None
    return _summary(payload["data"])


def _get_children(lei: str) -> list[dict]:
    """Direkta dotterbolag (Level 2), paginerade. 404/tom = inga barn."""
    out: list[dict] = []
    path: str | None = f"/lei-records/{lei}/direct-children"
    params: dict | None = {"page[size]": 100, "page[number]": 1}
    pages = 0
    while path and pages < MAX_CHILD_PAGES:
        payload = _get(path, params)
        if not payload:
            break
        for rec in payload.get("data") or []:
            summary = _summary(rec)
            if summary:
                out.append(summary)
        nxt = (payload.get("links") or {}).get("next")
        if not nxt:
            break
        # next-länken är absolut och bär redan pagineringsparametrarna.
        path = nxt.replace(API_BASE, "")
        params = None
        pages += 1
    return out


def search_lei(query: str, limit: int = 5) -> list[dict]:
    """Sök LEI på legalt namn — för onboarding (företagsnamn → LEI-kod).

    Returnerar [{name, lei, address}] för de bästa träffarna.
    """
    if not query.strip():
        return []
    payload = _get(
        "/lei-records",
        {"filter[entity.legalName]": query, "page[size]": limit},
    )
    if not payload:
        return []
    out: list[dict] = []
    for rec in payload.get("data") or []:
        summary = _summary(rec)
        if not summary:
            continue
        entity = (rec.get("attributes") or {}).get("entity") or {}
        summary["address"] = _format_address(entity.get("legalAddress") or {})
        out.append(summary)
    return out


# --- Parsning --------------------------------------------------------------


def _legal_name(entity: dict) -> str | None:
    legal_name = entity.get("legalName")
    if isinstance(legal_name, dict):
        return legal_name.get("name")
    return legal_name or None


def _format_address(addr: dict) -> str | None:
    parts = [p for p in (addr.get("city"), addr.get("country")) if p]
    return ", ".join(parts) or None


def _summary(rec: dict) -> dict | None:
    """En lei-record → {name, lei}. Används för moder/dotter-noder."""
    attrs = rec.get("attributes") or {}
    lei = attrs.get("lei") or rec.get("id")
    if not lei:
        return None
    return {"name": _legal_name(attrs.get("entity") or {}), "lei": lei}
