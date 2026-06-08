"""Crawl av en kunds domän: upptäck URL:er och hämta råbytes.

Företrädesordning för vilka sidor som besöks (docs/website-connector-spec.md §3):

    1. explicit lista  — kunden anger exakta URL:er; inget annat besöks
    2. sitemap.xml     — komplett, ren URL-lista om den finns
    3. bounded BFS     — följ länkar inom samma domän, max_depth + max_pages

Hämtaren (`fetcher`) är injicerbar så crawl-logiken kan testas utan nätverk.
Allt är defensivt: en sida som faller bort (timeout, 4xx, för stor) hoppas över,
inget undantag bubblar upp — connectorn ska aldrig krascha på en trasig sajt.
"""
from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from collections import deque
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urljoin, urlparse

import httpx

from services import safe_fetch

log = logging.getLogger(__name__)

USER_AGENT = "InsiderGraphBot/1.0"
HARD_PAGE_CAP = 200            # tak oavsett konfig — skydd mot skenande crawl

_HREF_RE = re.compile(r'href=["\']([^"\'#]+)', re.IGNORECASE)


@dataclass
class CrawlConfig:
    start_url: str
    urls: list[str] = field(default_factory=list)   # explicit lista (vinner om satt)
    max_pages: int = 50
    max_depth: int = 2
    max_file_size_mb: int = 10


@dataclass
class FetchResult:
    url: str
    content_type: str        # "html" | "pdf"
    raw: bytes


Fetcher = Callable[[str, int], FetchResult | None]


def crawl(config: CrawlConfig, fetcher: Fetcher | None = None) -> list[FetchResult]:
    """→ hämtade resurser (html/pdf), avgränsade enligt config."""
    fetch = fetcher or _httpx_fetch
    max_pages = min(config.max_pages, HARD_PAGE_CAP)

    if config.urls:
        return _fetch_list(config.urls, max_pages, config.max_file_size_mb, fetch)

    sitemap_urls = _discover_sitemap(config.start_url, config.max_file_size_mb, fetch)
    if sitemap_urls:
        return _fetch_list(sitemap_urls, max_pages, config.max_file_size_mb, fetch)

    return _bfs(config, max_pages, fetch)


def _fetch_list(urls: list[str], max_pages: int, max_mb: int, fetch: Fetcher) -> list[FetchResult]:
    out: list[FetchResult] = []
    for url in urls[:max_pages]:
        res = fetch(url, max_mb)
        if res:
            out.append(res)
    return out


def _bfs(config: CrawlConfig, max_pages: int, fetch: Fetcher) -> list[FetchResult]:
    domain = _domain(config.start_url)
    seen: set[str] = set()
    out: list[FetchResult] = []
    queue: deque[tuple[str, int]] = deque([(config.start_url, 0)])

    while queue and len(out) < max_pages:
        url, depth = queue.popleft()
        url = _normalize(url)
        if url in seen:
            continue
        seen.add(url)

        res = fetch(url, config.max_file_size_mb)
        if not res:
            continue
        out.append(res)

        # Följ bara länkar från HTML, inom samma domän, under djupgränsen.
        if res.content_type == "html" and depth < config.max_depth:
            for link in _extract_links(res.raw, url, domain):
                if link not in seen:
                    queue.append((link, depth + 1))
    return out


def _discover_sitemap(start_url: str, max_mb: int, fetch: Fetcher) -> list[str]:
    base = f"{urlparse(start_url).scheme}://{_domain(start_url)}"
    res = fetch(urljoin(base, "/sitemap.xml"), max_mb)
    if not res:
        return []
    try:
        root = ET.fromstring(res.raw)
    except ET.ParseError:
        return []
    # Namnrymds-agnostiskt: plocka alla <loc>-texter (urlset eller sitemapindex).
    locs = [el.text.strip() for el in root.iter() if _localname(el.tag) == "loc" and el.text]
    same_domain = [u for u in locs if _domain(u) == _domain(start_url)]
    return same_domain


def _extract_links(raw: bytes, base_url: str, domain: str) -> list[str]:
    try:
        html = raw.decode("utf-8", errors="replace")
    except Exception:
        return []
    out: list[str] = []
    for href in _HREF_RE.findall(html):
        absolute = _normalize(urljoin(base_url, href))
        if _domain(absolute) == domain and absolute.startswith(("http://", "https://")):
            out.append(absolute)
    return out


# --- httpx-hämtare (default) ----------------------------------------------


def _httpx_fetch(url: str, max_mb: int) -> FetchResult | None:
    # Lazy import: undviker cirkulärt beroende web_crawl ↔ connectors vid modulladdning.
    from connectors import readers

    try:
        resp = safe_fetch.safe_get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    except (httpx.HTTPError, safe_fetch.SsrfError) as exc:
        log.warning("fetch failed for %s: %s", url, exc)
        return None
    if resp.status_code >= 400:
        log.warning("%s returned %s", url, resp.status_code)
        return None
    if len(resp.content) > max_mb * 1024 * 1024:
        log.info("skipping %s — exceeds %s MB", url, max_mb)
        return None

    content_type = readers.detect_content_type(url, resp.headers.get("content-type"))
    if content_type is None:
        return None
    return FetchResult(url=url, content_type=content_type, raw=resp.content)


# --- url-helpers -----------------------------------------------------------


def _domain(url: str) -> str:
    netloc = urlparse(url).netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def _normalize(url: str) -> str:
    """Strippa fragment och avslutande slash så vi inte besöker samma sida två gånger."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}{path}" + (f"?{parsed.query}" if parsed.query else "")


def _localname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
