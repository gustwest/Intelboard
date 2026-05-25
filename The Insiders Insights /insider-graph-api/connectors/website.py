"""Website-connector — crawlar en kunds domän, läser text ur HTML/PDF.

Kedja (docs/website-connector-spec.md):

    crawl → extract (html/pdf → text) → relevans-grind (sidnivå) →
    chunkning → total budget → RawItem per chunk

Allt sidinnehåll får schema_type="Organization": compilern renderar det som en
WebPage-källnod (schema_org/compiler.py:179) utan att behöva ändras. Varje chunk
får ett stabilt id (hash av url+chunk_index) → veckovis omkörning skriver över i
stället för att hopa dubbletter.

Person-attribution (koppla personsidor till employee_id) ligger utanför v1.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from connectors import readers
from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem
from services import relevance
from services.web_crawl import CrawlConfig, crawl

log = logging.getLogger(__name__)

TOTAL_CHUNK_BUDGET = 300      # max chunks/körning efter relevansgrindning (§6)


class WebsiteConnector(BaseConnector):
    id = "website"
    fetch_method = "scrape"
    output_types = ("Organization",)
    frequency = "weekly"
    tier = "standard"
    input_fields = (
        InputField(
            "website_start_url",
            "Webb-URL (start)",
            type="url",
            required=True,
            placeholder="https://kund.se",
            help="Crawlern startar här och följer interna länkar.",
        ),
    )

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        params = config.params.get("website") or {}
        start_url = params.get("start_url")
        urls = params.get("urls") or []
        if not start_url and not urls:
            return []

        crawl_config = CrawlConfig(
            start_url=start_url or (urls[0] if urls else ""),
            urls=urls,
            max_pages=int(params.get("max_pages", 50)),
            max_depth=int(params.get("max_depth", 2)),
            max_file_size_mb=int(params.get("max_file_size_mb", 10)),
        )

        # 1. crawl → 2. extrahera text per sida (hoppa över tomma/needs_ocr)
        candidates: list[relevance.Candidate] = []
        docs: dict[str, readers.Document] = {}
        for res in crawl(crawl_config):
            doc = readers.extract(res.url, res.content_type, res.raw)
            if doc is None or not doc.text:
                if doc and doc.needs_ocr:
                    log.info("skipping scanned pdf (needs_ocr): %s", res.url)
                continue
            docs[res.url] = doc
            candidates.append(relevance.Candidate(url=res.url, title=doc.title, text=doc.text))

        # 3. relevans-grind på sidnivå (heuristik + ev. LLM)
        relevant = relevance.apply(candidates)

        # 4. chunkning + total budget → RawItem per chunk
        items: list[RawItem] = []
        now = datetime.now(timezone.utc)
        for cand in relevant:
            doc = docs[cand.url]
            chunks = readers.chunk_text(doc.text)
            total = len(chunks)
            for idx, chunk in enumerate(chunks):
                if len(items) >= TOTAL_CHUNK_BUDGET:
                    log.info("hit chunk budget (%s) — stopping", TOTAL_CHUNK_BUDGET)
                    return items
                extra = {
                    "name": doc.title,
                    "doc_url": cand.url,
                    "chunk_index": idx,
                    "chunk_total": total,
                    "content_type": doc.content_type,
                }
                items.append(
                    RawItem(
                        source="website",
                        schema_type="Organization",
                        content=chunk,
                        url=cand.url,
                        published_at=now,
                        item_id=_chunk_id(cand.url, idx),
                        extra={k: v for k, v in extra.items() if v is not None},
                    )
                )
        return items


def _chunk_id(url: str, chunk_index: int) -> str:
    digest = hashlib.sha1(f"{url}#{chunk_index}".encode("utf-8")).hexdigest()[:16]
    return f"web-{digest}"
