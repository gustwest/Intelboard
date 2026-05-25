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

from services import llm as llm_factory

log = logging.getLogger(__name__)

MIN_TEXT_LEN = 200            # tecken: kortare sidor bär sällan faktainnehåll
RELEVANCE_THRESHOLD = 0.5     # startgissning, kalibreras mot riktig data

# URL-mönster som nästan aldrig bär företagsfakta värda att lyfta.
_NOISE_PATTERNS = re.compile(
    r"/(cookies?|integritet|privacy|gdpr|villkor|terms|login|logga-in|sign-?in|"
    r"wp-login|cart|kassa|checkout|sitemap)\b",
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
    """Kör hela relevans-lagret. gate_llm=None → bara heuristik."""
    survivors = heuristic_filter(candidates)
    llm = gate_llm if gate_llm is not None else llm_factory.make_generator()
    if llm is None:
        log.info("no LLM for relevance gate — heuristic filtering only")
        return survivors
    return llm_gate(survivors, llm)


def heuristic_filter(candidates: list[Candidate]) -> list[Candidate]:
    out: list[Candidate] = []
    seen: set[str] = set()
    for cand in candidates:
        text = (cand.text or "").strip()
        if len(text) < MIN_TEXT_LEN:
            continue
        if _NOISE_PATTERNS.search(cand.url):
            continue
        fingerprint = hashlib.sha1(text[:1000].encode("utf-8")).hexdigest()
        if fingerprint in seen:        # nästan-identisk boilerplate
            continue
        seen.add(fingerprint)
        out.append(cand)
    return out


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
