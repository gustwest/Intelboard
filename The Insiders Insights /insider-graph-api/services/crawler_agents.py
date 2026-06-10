"""AI-crawler-igenkänning för crawl-health (P2, passiv mätning).

Mappar en user-agent-sträng → känd AI-bot + kategori. Används av crawl_health för att
filtrera GCS usage-loggar ner till de träffar som betyder något: hämtar AI-motorernas
crawlers faktiskt vår hostade sanningssida?

UA kan spoofas — detta är presence-/recency-signalering för en ops-vy, INTE en
säkerhetskontroll. (Hårdning mot spoofing = verifiera mot publicerade IP-intervall;
en framtida förstärkning, inte MVP.) Registret är kurerat och lätt att utöka.

Kategorier:
  ai_search   — live-retrieval: hämtar vid frågetillfället → direkt citeringssignal
                (PerplexityBot, OAI-SearchBot, ChatGPT-User …).
  ai_training — tränings-/korpus-crawler: långsammare payoff (GPTBot, ClaudeBot,
                Google-Extended, CCBot …).
"""
from __future__ import annotations

import re

# (regex, kanoniskt namn, kategori). Mönstren matchas case-insensitivt mot UA-strängen;
# första träff vinner. Ordningen är specifik-före-generell där det spelar roll.
_AGENTS: list[tuple[str, str, str]] = [
    # OpenAI
    (r"OAI-SearchBot", "OAI-SearchBot", "ai_search"),
    (r"ChatGPT-User", "ChatGPT-User", "ai_search"),
    (r"GPTBot", "GPTBot", "ai_training"),
    # Anthropic
    (r"Claude-Web", "Claude-Web", "ai_search"),
    (r"ClaudeBot", "ClaudeBot", "ai_training"),
    (r"anthropic-ai", "anthropic-ai", "ai_training"),
    # Perplexity
    (r"Perplexity-User", "Perplexity-User", "ai_search"),
    (r"PerplexityBot", "PerplexityBot", "ai_search"),
    # Google (Gemini-träning) — Googlebot självt utelämnat (klassisk sök, inte AI-svar)
    (r"Google-Extended", "Google-Extended", "ai_training"),
    # Apple Intelligence
    (r"Applebot-Extended", "Applebot-Extended", "ai_training"),
    # Övriga AI-aktörer
    (r"Meta-ExternalAgent", "Meta-ExternalAgent", "ai_training"),
    (r"Bytespider", "Bytespider", "ai_training"),
    (r"Amazonbot", "Amazonbot", "ai_training"),
    (r"cohere-ai", "cohere-ai", "ai_training"),
    (r"YouBot", "YouBot", "ai_search"),
    (r"DuckAssistBot", "DuckAssistBot", "ai_search"),
    # Common Crawl — matar MÅNGA modellers träningskorpus, sist (generell)
    (r"CCBot", "CCBot", "ai_training"),
]

_COMPILED = [(re.compile(pat, re.IGNORECASE), name, cat) for pat, name, cat in _AGENTS]

CATEGORY_LABELS = {
    "ai_search": "Live-sök (citerar i realtid)",
    "ai_training": "Tränings-/korpus-crawler",
}


def identify(user_agent: str | None) -> tuple[str, str] | None:
    """UA-sträng → (kanoniskt bot-namn, kategori), eller None om ingen känd AI-bot."""
    if not user_agent:
        return None
    for rx, name, cat in _COMPILED:
        if rx.search(user_agent):
            return name, cat
    return None


def known_bot_names() -> list[str]:
    """Alla kanoniska bot-namn (för t.ex. tom-stat i frontend)."""
    return [name for _pat, name, _cat in _AGENTS]
