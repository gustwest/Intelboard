"""Bolagsverket-connector — Allabolag- och Bolagsverket-data om organisationen.

Bolagsverket har ett öppet API för organisationsdata (`bolagsverket.se/oapi`).
För MVP använder vi det publika `https://api.bolagsverket.se/oapi/organisationsdata/v1`
om `BOLAGSVERKET_API_KEY` finns; saknas den returnerar vi tom lista.

Kör endast på företagsnivå (inte per medarbetare). Trigga månadsvis.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from config import settings
from connectors.base import BaseConnector, ConnectorConfig, RawItem

log = logging.getLogger(__name__)

API_BASE = "https://api.bolagsverket.se/oapi/organisationsdata/v1"


class BolagsverketConnector(BaseConnector):
    id = "bolagsverket"
    fetch_method = "api"
    output_types = ("Organization",)
    frequency = "monthly"
    tier = "standard"

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        if not settings.bolagsverket_api_key:
            return []
        org_number = config.params.get("org_number")
        if not org_number:
            return []
        norm = org_number.replace("-", "").strip()

        try:
            with httpx.Client(timeout=20) as client:
                resp = client.get(
                    f"{API_BASE}/organisationer/{norm}",
                    headers={
                        "Authorization": f"Bearer {settings.bolagsverket_api_key}",
                        "Accept": "application/json",
                    },
                )
        except httpx.HTTPError as exc:
            log.warning("bolagsverket fetch failed: %s", exc)
            return []
        if resp.status_code != 200:
            log.warning("bolagsverket %s → %s", norm, resp.status_code)
            return []

        data = resp.json() or {}
        return [
            RawItem(
                source="bolagsverket",
                schema_type="Organization",
                content=(data.get("verksamhetsbeskrivning") or "").strip()[:2000],
                url=f"https://www.allabolag.se/{norm}",
                published_at=datetime.now(timezone.utc),
                extra={
                    "name": data.get("foretagsnamn"),
                    "org_number": norm,
                    "founded": data.get("registreringsdatum"),
                    "legal_form": data.get("foretagsform"),
                    "address": data.get("adress"),
                    "sni_codes": data.get("sniKoder"),
                },
            )
        ]
