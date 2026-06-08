"""RSS-connector — generisk för flera källor.

Använd för pressrum, substack, podcast, karriärsidor (om de exponerar RSS).
Varje kund konfigurerar feeds per nodtyp:

    clients/{id}/settings.rss_feeds = [
        {"url": "...", "schema_type": "NewsArticle", "label": "Pressrum"},
        {"url": "...", "schema_type": "JobPosting",  "label": "Karriär"},
        {"url": "...", "schema_type": "PodcastEpisode", "label": "Podd"},
    ]

ConnectorConfig.params måste innehålla `rss_feeds` (lista enligt ovan).
"""
from __future__ import annotations

import hashlib
import logging
import xml.etree.ElementTree as ET

from defusedxml.ElementTree import fromstring as safe_fromstring
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem
from services import safe_fetch

log = logging.getLogger(__name__)

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "media": "http://search.yahoo.com/mrss/",
    "atom": "http://www.w3.org/2005/Atom",
}


class RssConnector(BaseConnector):
    id = "rss"
    fetch_method = "rss"
    output_types = ("NewsArticle", "JobPosting", "PodcastEpisode")
    frequency = "daily"
    tier = "standard"
    input_fields = (
        InputField(
            "rss_feeds",
            "RSS-feeds",
            type="feed_list",
            required=True,
            help="En rad per feed: URL, schema-typ (NewsArticle/JobPosting/PodcastEpisode) och etikett.",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        feeds = config.params.get("rss_feeds") or []
        if not feeds:
            return []

        items: list[RawItem] = []
        for feed in feeds:
            url = feed.get("url")
            if not url:
                continue
            schema_type = feed.get("schema_type") or "NewsArticle"
            items.extend(self._fetch_feed(url, schema_type))
        return items

    def _fetch_feed(self, url: str, schema_type: str) -> list[RawItem]:
        try:
            resp = safe_fetch.safe_get(url, headers={"User-Agent": "InsiderGraphBot/1.0"}, timeout=20)
        except (httpx.HTTPError, safe_fetch.SsrfError) as exc:
            log.warning("rss fetch failed for %s: %s", url, exc)
            return []
        if resp.status_code >= 400:
            log.warning("rss %s returned %s", url, resp.status_code)
            return []

        try:
            # defusedxml: blockerar XXE/entity-expansion i kund-kontrollerade feeds.
            # DefusedXmlException ärver ValueError → fångas här (feeden förkastas).
            root = safe_fromstring(resp.content)
        except (ET.ParseError, ValueError) as exc:
            log.warning("rss parse failed for %s: %s", url, exc)
            return []

        items: list[RawItem] = []
        for entry in _iter_entries(root):
            item = _entry_to_raw(entry, url, schema_type)
            if item:
                items.append(item)
        return items


def _iter_entries(root: ET.Element):
    yield from root.iter("item")
    for atom in root.iter("{http://www.w3.org/2005/Atom}entry"):
        yield atom


def _entry_to_raw(entry: ET.Element, feed_url: str, schema_type: str) -> RawItem | None:
    title = _text(entry, "title")
    link = _text(entry, "link") or _atom_link(entry)
    if not (title or link):
        return None

    description = _text(entry, "description") or _text(entry, "summary")
    content_enc = _text(entry, "content:encoded", NS) or _text(entry, "content")
    body = (content_enc or description or "").strip()

    published_raw = (
        _text(entry, "pubDate")
        or _text(entry, "published")
        or _text(entry, "updated")
    )
    published_at = _parse_date(published_raw) or datetime.now(timezone.utc)

    # GUID > link > title som stabil seed. Samma entry → samma id mellan körningar,
    # så scrape_active kan persistera idempotent (set istället för add) och tål
    # task-retry utan dubbletter.
    seed = _text(entry, "guid") or _text(entry, "{http://www.w3.org/2005/Atom}id") or link or title or ""
    item_id = "rss-" + hashlib.sha1(f"{feed_url}\n{seed}".encode("utf-8")).hexdigest()[:16]

    return RawItem(
        source="rss",
        schema_type=schema_type,
        content=body[:2000],
        url=link or feed_url,
        published_at=published_at,
        extra={
            "name": title,
            "feed_url": feed_url,
        },
        item_id=item_id,
    )


def _text(entry: ET.Element, tag: str, ns: dict[str, str] | None = None) -> str | None:
    el = entry.find(tag, ns) if ns else entry.find(tag)
    if el is None:
        return None
    return (el.text or "").strip() or None


def _atom_link(entry: ET.Element) -> str | None:
    for link in entry.iter("{http://www.w3.org/2005/Atom}link"):
        href = link.attrib.get("href")
        if href:
            return href
    return None


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
