"""Subjekt-grind för probe-frågor — fångar andrapersons-läckan (delad av alla loopar).

Problem: en probe-fråga som tilltalar mätobjektet i andra person ("You claim to…",
"Hur säkerställer ni…?") UTAN att namnge bolaget gör att probe-motorn tolkar "du/you"
som SIG SJÄLV i stället för bolaget vi mäter — och svarar t.ex. "I'm Claude, I don't
have clients". Det blir ett artefakt-fynd (#5 skadlig tystnad), inte en verklig risk.

Regel: en fråga är subjekt-osäker om den innehåller andrapersons-tilltal MEN inte
namnger bolaget. Namnges bolaget adresserar "du/you" rimligen den som *svarar*
(motorn) — exakt som värme-probernas "Som potentiell kund, märker du om {company}…",
vilket är ofarligt. Därför grindar vi bara "andra person UTAN bolagsnamn".

Genereringsprompterna förbjuder redan andraperson; den här grinden är försvaret om
en formulering ändå slinker igenom (gammal godkänd fråga, kund-författad polling-fråga,
modell som driftar). Konservativ med flit — hellre släppa igenom en gränsfråga än
filtrera bort en legitim, namngiven fråga.
"""
from __future__ import annotations

import re

# Andrapersons-tilltal, sv + en. Ordgränser så vi inte träffar delsträngar
# ("education" ⊅ "du", "expert" ⊅ "er"). "er/ni/du" m.fl. matchar bara fristående.
_SECOND_PERSON = re.compile(
    r"\b(du|dig|din|ditt|dina|ni|er|ert|era|you|your|yours|yourself|yourselves)\b",
    re.IGNORECASE,
)

# Bolagsformer som inte är distinktiva — räknas inte som "bolaget namnges".
_LEGAL_FORMS = {
    "ab", "asa", "as", "oy", "oyj", "gmbh", "ag", "ltd", "inc", "llc", "plc",
    "corp", "co", "sa", "bv", "nv", "the", "and", "och", "aktiebolag", "group",
}


def _names_company(text_lower: str, company_name: str) -> bool:
    """Namnger texten bolaget? Hela namnet ELLER något distinktivt ord ur det
    (≥3 tecken, ej bolagsform) räcker — så "Acme" matchar kund "Acme AB"."""
    name = (company_name or "").strip().lower()
    if not name:
        return False
    if name in text_lower:
        return True
    for tok in re.split(r"\W+", name):
        if len(tok) >= 3 and tok not in _LEGAL_FORMS and re.search(rf"\b{re.escape(tok)}\b", text_lower):
            return True
    return False


def text_mentions(text: str, name: str, *, split_tokens: bool = False) -> bool:
    """Ordgräns-matchning av ett entitetsnamn i text (P8 — hårdare mention-detektering).

    Ersätter rå delsträngsmatchning som både gav falska positiva ("Volvo" träffade
    "Volvocars") och falska negativa (kund "Acme AB" syntes inte när motorn skrev
    bara "Acme"). Med ordgränser träffar vi hela namnet ELLER — när `split_tokens`
    är på — ett distinktivt token ur namnet (≥3 tecken, ej bolagsform).

    `split_tokens=True` för BOLAG (så "Acme" matchar "Acme AB"); AV för PERSONNAMN
    (annars skulle ett vanligt förnamn som "Anna" matcha vem som helst)."""
    if not text or not name:
        return False
    low = text.lower()
    nm = name.strip().lower()
    if not nm:
        return False
    if re.search(rf"\b{re.escape(nm)}\b", low):
        return True
    if split_tokens:
        for tok in re.split(r"\W+", nm):
            if len(tok) >= 3 and tok not in _LEGAL_FORMS and re.search(rf"\b{re.escape(tok)}\b", low):
                return True
    return False


def addresses_subject_in_second_person(text: str, company_name: str) -> bool:
    """True om frågan riskerar att probe-motorn tolkar tilltalet som sig själv:
    andrapersons-pronomen finns MEN bolaget namnges inte. Namnges bolaget → ofarligt."""
    if not text:
        return False
    if not _SECOND_PERSON.search(text):
        return False
    return not _names_company(text.lower(), company_name)
