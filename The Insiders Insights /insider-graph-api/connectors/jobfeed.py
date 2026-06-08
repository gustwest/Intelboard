"""Jobfeed-connector — ATS-platsannonser via XML/RSS (Teamtailor, Jobylon m.fl.).

Skiljer sig från den generiska RSS-connectorn på två sätt:

1. Varje annons får ett **stabilt** `item_id` = hash(client_id + extern job_id),
   så omkörning skriver över samma dokument i stället för att hopa dubbletter.
   Det är detta stabila id som `jobs/xml_sync.py` använder för att upptäcka när
   en annons försvunnit ur feeden (= jobbet stängt → Decay Protocol, spec §3).
2. Vi plockar ut den externa `job_id` per annons (ATS-id/guid/referensnummer) och
   lägger den i `extra["job_id"]`, så diff-loopen kan jämföra gårdagens och dagens
   id-mängder.

Feeds konfigureras per kund (speglar settings.rss_feeds):

    clients/{id}/settings.job_feeds = [
        {"url": "https://kund.teamtailor.com/jobs.xml", "label": "Teamtailor"},
    ]

Själva connectorn är *stateless* (returnerar bara dagens annonser). Diffen mot
gårdagen ligger i jobs/xml_sync.py — så `fetch()`-kontraktet hålls rent.
"""
from __future__ import annotations

import hashlib
import logging
import xml.etree.ElementTree as ET

from defusedxml.ElementTree import fromstring as safe_fromstring
from datetime import datetime, timezone

import httpx

from services import safe_fetch

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem
from services.skill_extractor import extract_skills

log = logging.getLogger(__name__)

# Lokala taggnamn (utan namespace) vi letar efter per fält. ATS-feeds varierar,
# så vi provar flera alias och tar första som ger ett värde.
_ID_TAGS = ("id", "guid", "reference", "reference-number", "requisitionid", "job-id")
_TITLE_TAGS = ("title", "name", "position", "headline", "job-title")
_BODY_TAGS = ("description", "body", "content", "content:encoded", "summary", "job-description")
_URL_TAGS = ("url", "link", "apply-url", "applyurl", "ad-url")
_LOCATION_TAGS = ("location", "city", "workplace", "region")
_DATE_TAGS = ("created-at", "published", "pubdate", "date", "first-published-at")

# Annons-elementets taggnamn (ATS-XML resp. RSS/Atom-fallback).
_JOB_TAGS = frozenset({"job", "position", "vacancy"})
_ITEM_TAGS = frozenset({"item", "entry"})

# Lokalt taggnamn → fältnyckel, för enkelpass-extraktion (taggmängderna är disjunkta).
_FIELD_BY_TAG: dict[str, str] = {
    tag: field
    for field, tags in (
        ("id", _ID_TAGS), ("title", _TITLE_TAGS), ("body", _BODY_TAGS),
        ("url", _URL_TAGS), ("location", _LOCATION_TAGS), ("date", _DATE_TAGS),
    )
    for tag in tags
}


class JobFeedConnector(BaseConnector):
    id = "jobfeed"
    fetch_method = "rss"
    output_types = ("JobPosting",)
    frequency = "daily"
    tier = "standard"
    input_fields = (
        InputField(
            "job_feeds",
            "Platsannons-feeds (ATS)",
            type="feed_list",
            required=True,
            help="XML/RSS-feed från rekryteringssystemet (Teamtailor, Jobylon …). "
            "En rad per feed: URL och etikett.",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        feeds = config.params.get("job_feeds") or []
        if not feeds:
            return []

        items: list[RawItem] = []
        for feed in feeds:
            url = feed.get("url") if isinstance(feed, dict) else feed
            if not url:
                continue
            items.extend(self._fetch_feed(config.client_id, url))
        return items

    def _fetch_feed(self, client_id: str, url: str) -> list[RawItem]:
        try:
            resp = safe_fetch.safe_get(url, headers={"User-Agent": "InsiderGraphBot/1.0"}, timeout=20)
        except (httpx.HTTPError, safe_fetch.SsrfError) as exc:
            log.warning("jobfeed fetch failed for %s: %s", url, exc)
            return []
        if resp.status_code >= 400:
            log.warning("jobfeed %s returned %s", url, resp.status_code)
            return []

        try:
            # defusedxml: blockerar XXE/entity-expansion i kund-kontrollerade feeds.
            root = safe_fromstring(resp.content)
        except (ET.ParseError, ValueError) as exc:
            log.warning("jobfeed parse failed for %s: %s", url, exc)
            return []

        items: list[RawItem] = []
        for entry in _iter_jobs(root):
            item = _entry_to_raw(client_id, entry, url)
            if item:
                items.append(item)
        return items


def _iter_jobs(root: ET.Element) -> list[ET.Element]:
    """Annons-element i dokumentordning. ATS-XML (<job>/<position>) går före
    RSS/Atom-fallbacken (<item>/<entry>); ett enda svep genom trädet."""
    jobs: list[ET.Element] = []
    items: list[ET.Element] = []
    for el in root.iter():
        tag = _local(el.tag)
        if tag in _JOB_TAGS:
            jobs.append(el)
        elif tag in _ITEM_TAGS:
            items.append(el)
    return jobs or items


def _entry_to_raw(client_id: str, entry: ET.Element, feed_url: str) -> RawItem | None:
    f = _extract_fields(entry)
    title = f.get("title")
    link = f.get("url")

    # Utan extern id kan vi inte spåra stängning → faller tillbaka på url/titel.
    job_id = f.get("id") or link or title
    if not job_id or not (title or link):
        return None

    body = f.get("body", "")
    location = f.get("location")
    published_at = _parse_date(f.get("date")) or datetime.now(timezone.utc)

    # Strategiska kompetenser plockas ut redan här och persistas i extra, så de
    # finns kvar när annonsen stängts (Decay Protocol läser dem utan att re-hämta
    # texten). Baslinje-extraktion; Slice 3 berikar med ontologisk översättning.
    skills = extract_skills(f"{title or ''}\n{body}")

    return RawItem(
        source="jobfeed",
        schema_type="JobPosting",
        content=body[:2000],
        url=link or feed_url,
        published_at=published_at,
        item_id=_stable_item_id(client_id, job_id),
        extra={
            "name": title,
            "job_id": str(job_id),
            "jobLocation": location,
            "skills": skills,
            "feed_url": feed_url,
        },
    )


def _stable_item_id(client_id: str, job_id: str) -> str:
    digest = hashlib.sha1(f"{client_id}::{job_id}".encode("utf-8")).hexdigest()[:16]
    return f"jobposting-{digest}"


def _local(tag: str) -> str:
    """Strippa XML-namespace: '{ns}job' → 'job'. Gemener för tålig matchning."""
    return tag.rsplit("}", 1)[-1].lower()


def _extract_fields(entry: ET.Element) -> dict[str, str]:
    """Plocka alla fält i ETT svep genom annonsens subträd. Första icke-tomma
    värdet per fält vinner. Atom-länkens href används om inget url-element har text."""
    out: dict[str, str] = {}
    atom_href: str | None = None
    for el in entry.iter():
        if el is entry:
            continue
        tag = _local(el.tag)
        if tag == "link" and atom_href is None:
            atom_href = el.attrib.get("href") or None
        field = _FIELD_BY_TAG.get(tag)
        if field and field not in out:
            text = (el.text or "").strip()
            if text:
                out[field] = text
    if "url" not in out and atom_href:
        out["url"] = atom_href
    return out


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    from email.utils import parsedate_to_datetime

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
