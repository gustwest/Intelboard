"""F1 (frågedesign-programmet, utvecklingsplan 2026-06-11 Etapp 5): kvalitetsramverk
för frågorna själva — rubric-loopen bedömer svaren, men inget granskade frågorna.

Regelbaserad detektor för ledande språk: presuppositioner, superlativ-inramning,
emotiva ord, falska dikotomier, flerledade frågor och du-tilltal utan företagsnamn
(via probe_guard). FLAGGAR, blockerar inte: en flagga är en läsanvisning till
granskaren i review-grinden, inte ett automatiskt underkännande — adversariella
risk-frågor är t.ex. AVSIKTLIGT negativt inramade, och flaggan gör det synligt.

Svenska först (mätspråket); mönstren kalibreras löpande inom Etapp 5 (F2:s
kontrollfrågor kvantifierar hur mycket inramningen faktiskt påverkar)."""
from __future__ import annotations

import re

from services import probe_guard

# Flagg-id → svensk etikett (UI/granskning). Håll i synk med frontendens chips.
FLAG_SV: dict[str, str] = {
    "negativ_presupposition": "Förutsätter problemet",
    "superlativ_inramning": "Superlativ/ranking-inramning",
    "emotivt_sprak": "Emotivt laddade ord",
    "falsk_dikotomi": "Antingen/eller-låsning",
    "flerledad": "Flera frågor i en",
    "du_tilltal_utan_foretag": "Du-tilltal utan företagsnamn",
}

# "Varför är/har X (så) <negativt>" — frågan postulerar bristen istället för att fråga
# om den finns. Skiljer sig från "finns det tecken på X?" som är en öppen ja/nej-fråga.
_PRESUPPOSITION = re.compile(
    r"\bvarför\s+(är|har|brister|misslyckas|undviker|döljer|mörkar)\b"
    r"|\bnär\s+slutade\b"
    r"|\bhur\s+(dåligt|illa)\b",
    re.IGNORECASE,
)

# Ranking-/superlativ-ord primar motorn på konkurrenslandskapet och kan blåsa upp
# Share of Voice (audit p.18.1). Default-mallarna använder dem avsiktligt — flaggan
# gör priming-graden synlig och ger F2 (kontrollfrågor) något att jämföra mot.
_SUPERLATIVE = re.compile(
    r"\b(ledande|bäst[a]?|sämst[a]?|störst[a]?|värst[a]?|starkast[e]?|främst[a]?"
    r"|mest\s+\w+|pionjär\w*|top[p]?\b)",
    re.IGNORECASE,
)

_EMOTIVE = re.compile(
    r"\b(skandal\w*|katastrof\w*|fiasko\w*|chockerande|avslöja\w*|fusk\w*|bluff\w*"
    r"|lurar\w*|svek\w*|härva\w*)",
    re.IGNORECASE,
)

_FALSE_DICHOTOMY = re.compile(r"\bantingen\b.+\beller\b", re.IGNORECASE)


def assess(text: str, company_name: str | None = None) -> list[str]:
    """Bedöm en fråga → lista flagg-id (tom = inga kvalitetsanmärkningar)."""
    t = (text or "").strip()
    if not t:
        return []
    flags: list[str] = []
    if _PRESUPPOSITION.search(t):
        flags.append("negativ_presupposition")
    if _SUPERLATIVE.search(t):
        flags.append("superlativ_inramning")
    if _EMOTIVE.search(t):
        flags.append("emotivt_sprak")
    if _FALSE_DICHOTOMY.search(t):
        flags.append("falsk_dikotomi")
    # Flerledad: mer än ett frågetecken, eller två+ samordnade satsled i samma fråga
    # ("X och Y och Z?") — svaren blir omöjliga att skadeklassa entydigt.
    if t.count("?") > 1 or len(re.findall(r"\soch\s", t, re.IGNORECASE)) >= 2:
        flags.append("flerledad")
    if company_name and probe_guard.addresses_subject_in_second_person(t, company_name):
        flags.append("du_tilltal_utan_foretag")
    return flags


def labels(flags: list[str] | None) -> list[str]:
    """Svenska etiketter för en flagglista (okända id:n passerar oöversatta)."""
    return [FLAG_SV.get(f, f) for f in (flags or [])]
