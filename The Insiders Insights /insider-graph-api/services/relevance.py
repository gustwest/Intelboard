"""Relevans-lager: avgör vad som är värt att mappa upp innan claim-extraktion.

Två steg, billigt → dyrt (docs/website-connector-spec.md §4):

  1. heuristisk förfiltrering  — gratis: släng brus-sidor (cookies/integritet/login),
                                 kräv minsta textlängd, deduplicera nästan-identiskt.
  2. LLM-relevansgrindning     — ett anrop per kvarvarande sida: "innehåller den här
                                 sidan företagsfakta värda att lyfta?". Behåll de
                                 relevanta, sorterade efter poäng.

Den hårda budgeten (max antal chunks/körning) sätts av connectorn efter chunkning.
Saknas LLM görs bara steg 1 — pipelinen fungerar ändå.
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from services import llm as llm_factory

log = logging.getLogger(__name__)

MIN_TEXT_LEN = 200            # tecken: kortare sidor bär sällan faktainnehåll
RELEVANCE_THRESHOLD = 0.5     # startgissning, kalibreras mot riktig data

# URL-mönster som nästan aldrig bär företagsfakta värda att lyfta:
# juridik/inloggning/kassa + rena SEO-/CMS-arkiv (tagg, kategori, författare, sök).
# Arkivsidorna är listningar utan eget faktainnehåll och duplicerar artiklar vi
# redan crawlar — de äter budget utan att tillföra entitetsfakta.
_NOISE_PATTERNS = re.compile(
    r"/(cookies?|integritet|privacy|gdpr|villkor|terms|login|logga-in|sign-?in|"
    r"wp-login|wp-admin|wp-json|cart|kassa|checkout|sitemap|"
    r"tag|tagg|taggar|tags|category|categories|kategori|kategorier|"
    r"author|authors|forfattare|skribent|"
    r"sok|sök|search|sokresultat|feed|rss)\b",
    re.IGNORECASE,
)

# Paginering (/page/2, /sida/3, ?page=4): listningssida N — samma listmall, sällan
# unik företagsfakta. Egen regex eftersom den matchar siffersuffix, inte ett ord.
_PAGINATION_PATTERN = re.compile(r"(/(page|sida|sidan)/\d+|[?&]page=\d+)", re.IGNORECASE)

# Sidtyper som nästan alltid bär stark entitetsfakta — prioriteras före budgettaket
# (TOTAL_CHUNK_BUDGET i website.py) så de hinner med även när crawlen är stor.
_HIGH_VALUE_PATTERNS = re.compile(
    r"/(om-?oss|om-?foretaget|om-?bolaget|about|company|vilka-vi-ar|"
    r"team|medarbetare|personal|anstallda|ledning|ledningsgrupp|styrelse|management|people|"
    r"tjanster|tjänster|services|produkter|products|losningar|lösningar|solutions|erbjudande|"
    r"kunder|customers|clients|case|cases|kundcase|referenser|referens|"
    r"kontakt|contact|"
    r"press|pressrum|nyheter|news|newsroom|aktuellt|"
    r"karriar|karriär|career|careers|jobb|jobs|lediga-jobb|lediga-tjanster|"
    r"historia|history|verksamhet)\b",
    re.IGNORECASE,
)

GATE_PROMPT = """Du avgör om en webbsida innehåller faktauppgifter om ETT FÖRETAG
värda att lyfta fram (verksamhet, produkter, historia, ledning, kunder, etc.).

Brus som INTE är relevant: cookie-/integritetstext, rena kontaktformulär,
juridiska villkor, navigationssidor utan eget innehåll.

Svara ENDAST med JSON: {"relevant": true|false, "score": 0.0-1.0}"""


@dataclass
class Candidate:
    url: str
    title: str | None
    text: str


def apply(candidates: list[Candidate], gate_llm=None) -> list[Candidate]:
    """Kör hela relevans-lagret. gate_llm=None → bara heuristik.

    Sista steget (prioritize) lägger startsida + kända faktasidor först så de
    ryms inom chunk-budgeten även på stora sajter.
    """
    survivors = heuristic_filter(candidates)
    llm = gate_llm if gate_llm is not None else llm_factory.make_generator()
    if llm is None:
        log.info("no LLM for relevance gate — heuristic filtering only")
        return prioritize(survivors)
    return prioritize(llm_gate(survivors, llm))


def heuristic_filter(candidates: list[Candidate]) -> list[Candidate]:
    out: list[Candidate] = []
    seen: set[str] = set()
    for cand in candidates:
        text = (cand.text or "").strip()
        if len(text) < MIN_TEXT_LEN:
            continue
        if _NOISE_PATTERNS.search(cand.url) or _PAGINATION_PATTERN.search(cand.url):
            continue
        fingerprint = hashlib.sha1(text[:1000].encode("utf-8")).hexdigest()
        if fingerprint in seen:        # nästan-identisk boilerplate
            continue
        seen.add(fingerprint)
        out.append(cand)
    return out


def path_rank(url: str) -> int:
    """Lägre = viktigare. Startsidan (0) och kända faktasidor (1) går före övrigt (2)."""
    path = urlparse(url).path.rstrip("/")
    if path in ("", "/"):                       # startsidan: viktigast av alla
        return 0
    if _HIGH_VALUE_PATTERNS.search(path):
        return 1
    return 2


def prioritize(candidates: list[Candidate]) -> list[Candidate]:
    """Stabil sortering på sidtyp. Bevarar inbördes ordning (t.ex. LLM-poäng eller
    crawl-ordning) inom varje nivå — vi lyfter bara fram de viktigaste sidtyperna."""
    return sorted(candidates, key=lambda c: path_rank(c.url))


def llm_gate(candidates: list[Candidate], llm) -> list[Candidate]:
    scored: list[tuple[float, Candidate]] = []
    for cand in candidates:
        payload = f"URL: {cand.url}\nTITEL: {cand.title or ''}\n\nTEXT:\n{cand.text[:4000]}"
        data = llm_factory.invoke_json(llm, GATE_PROMPT, payload)
        if data is None:
            # LLM-fel på en sida: behåll den hellre än att tappa möjlig fakta.
            scored.append((RELEVANCE_THRESHOLD, cand))
            continue
        if not data.get("relevant"):
            continue
        scored.append((float(data.get("score", RELEVANCE_THRESHOLD)), cand))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [cand for _score, cand in scored]
