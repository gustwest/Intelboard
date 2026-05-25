"""LinkedIn-connector via Bright Data Datasets API.

Två datasets:
  - profile (person) — för medarbetare
  - company         — för kundens företagsprofil

Posts skördas via separat dataset i framtiden. För MVP returnerar fetch()
profil + företag och låter Schema-kompilatorn binda ihop dem.

Utan BRIGHTDATA_API_KEY returnerar fetch() en tom lista — pipelinen ovanpå
fungerar fortfarande, men ingen data flödar in.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from config import settings
from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem
from services.brightdata import BrightDataClient

log = logging.getLogger(__name__)


class LinkedInConnector(BaseConnector):
    id = "linkedin"
    fetch_method = "scrape"
    output_types = ("Organization", "Person", "SocialMediaPosting", "JobPosting")
    frequency = "daily"
    tier = "standard"
    input_fields = (
        InputField(
            "company_linkedin_url",
            "Företagets LinkedIn-URL",
            type="url",
            required=True,
            placeholder="https://www.linkedin.com/company/exempel-ab",
        ),
        InputField(
            "scrape_employee_profiles",
            "Scrapa medarbetarnas LinkedIn-profiler",
            type="bool",
            required=False,
            help="Hämtar profildata per aktiv medarbetare, inte bara företagssidan.",
        ),
    )

    def __init__(self, client: BrightDataClient | None = None) -> None:
        self.client = client or BrightDataClient()

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        if not self.client.enabled:
            log.info("brightdata disabled — linkedin connector returning empty")
            return []

        urls = [u for u in [config.params.get("linkedin_url")] if u]
        if not urls:
            return []

        dataset_id = (
            settings.brightdata_linkedin_company_dataset_id
            if config.employee_id is None
            else settings.brightdata_linkedin_profile_dataset_id
        )
        if not dataset_id:
            log.warning("linkedin dataset_id not configured — skipping")
            return []

        records = self.client.fetch_sync(dataset_id, urls)
        items: list[RawItem] = []
        for rec in records:
            mapped = self._to_raw_item(rec, is_person=config.employee_id is not None)
            if mapped:
                items.append(mapped)
        return items

    def _to_raw_item(self, rec: dict[str, Any], *, is_person: bool) -> RawItem | None:
        url = rec.get("url") or rec.get("input_url")
        if not url:
            return None

        schema_type = "Person" if is_person else "Organization"
        if is_person:
            content = rec.get("about") or rec.get("headline") or rec.get("position") or ""
            extra = {
                "name": rec.get("name") or rec.get("full_name"),
                "title": rec.get("position") or rec.get("current_company", {}).get("title"),
                "education": [e.get("school") for e in rec.get("education", []) if e.get("school")],
                "previous_employers": [
                    e.get("company") for e in rec.get("experience", []) if e.get("company")
                ],
                "baseline_followers": rec.get("followers") or rec.get("connections"),
            }
        else:
            content = rec.get("about") or rec.get("description") or ""
            extra = {
                "name": rec.get("name") or rec.get("company_name"),
                "industry": rec.get("industries"),
                "founded": rec.get("founded"),
                "headquarters": rec.get("headquarters"),
                "baseline_followers": rec.get("followers"),
            }

        return RawItem(
            source="linkedin",
            schema_type=schema_type,
            content=content,
            url=url,
            published_at=_parse_dt(rec.get("timestamp")) or datetime.now(timezone.utc),
            extra={k: v for k, v in extra.items() if v is not None},
        )


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
