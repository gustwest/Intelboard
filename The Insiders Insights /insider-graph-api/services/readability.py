"""Lätt, deterministisk läsbarhetsheuristik (A8) — icke-blockerande signal.

Deep research (2026-06-05): låg perplexitet / klar, konventionell prosa höjer
citeringssannolikheten (Google AIO ~47%→56%). Men fyndet är mätt på ENGELSKA, så vi
bygger INTE en tung perplexitetsmodell nu — den substantiella valideringen för svenska
sker i C2 (polling-experimentet). Tills dess ger den här modulen en billig, språk-
agnostisk proxy (meningslängd) som loggas i shadow-rubric:en utan att blockera leverans.

Provisorisk: trösklarna är medvetet grova och ska kalibreras mot C2-utfall.
"""
from __future__ import annotations

import re

# Provisoriska trösklar (kalibreras i C2). Långa meningar = svårare att extrahera/citera.
_LONG_SENTENCE_WORDS = 30
_HIGH_AVG_WORDS = 25

_SENTENCE_SPLIT = re.compile(r"[.!?]+")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text or "") if s.strip()]


def summarize(texts: list[str]) -> dict | None:
    """Aggregera läsbarhet över en lista påståenden. None om inget att mäta.

    Returnerar grova mått + en provisorisk `low_readability`-flagga. Aldrig blockerande
    — konsumenten (shadow-loggen) lagrar bara signalen för trendning."""
    sentences: list[int] = []  # ordantal per mening
    for t in texts:
        for s in _sentences(t):
            sentences.append(len(s.split()))
    if not sentences:
        return None

    sentence_count = len(sentences)
    total_words = sum(sentences)
    avg = total_words / sentence_count
    long_count = sum(1 for w in sentences if w > _LONG_SENTENCE_WORDS)
    return {
        "sentence_count": sentence_count,
        "avg_words_per_sentence": round(avg, 1),
        "long_sentence_count": long_count,
        "low_readability": bool(avg > _HIGH_AVG_WORDS or long_count > sentence_count / 3),
        "provisional": True,  # trösklar ej kalibrerade för svenska — se C2
    }
