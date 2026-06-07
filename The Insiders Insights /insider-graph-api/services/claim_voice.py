"""Deterministisk röst- och social-metric-grind för narrative-claims.

Källtexter — särskilt LinkedIn-marknadsföring — är skrivna i FÖRSTA PERSON
("Vi hjälper…", "vår expertis") och späckade med fåfänge-mätvärden ("hundratals
följare"). En LLM som extraherar ordagrant ärver båda. Då publiceras bolagets egen
reklam som om den vore neutral, tredjepersons, citerbar sanning — raka motsatsen
till tesen (declared → demonstrated). AI-motorer citerar inte "vi är bäst".

Den här grinden kör som ett sista, modelloberoende textpass i claim-extraktionen
(efter claim_grounding). Den gör två saker:

  1. NEUTRALISERA RÖST — byt svenska första-persons-markörer (vi/oss/vår/vårt/våra)
     mot bolagsnamnet i tredje person. "Vi hjälper" → "Acme AB hjälper". Ändrar bara
     pronomen, aldrig siffror, så källgrundningen står kvar efteråt.
  2. SLÄNG SOCIAL-METRIC-LÄCKAGE — claims om följarantal/likes/delningar är fåfänge-
     mätvärden som ALDRIG får med (regeln finns i GENERATE_PROMPT, men en mjuk
     prompt-instruktion räcker bevisligen inte — här är den hårda spärren).

Ingen LLM, inga nätverksanrop. Demografi-claims (services/attested_ingest) bygger
ANDEL, inte antal, och skrivs direkt utan att gå genom claim-extraktionen — de träffas
alltså aldrig av social-metric-spärren här, vilket är meningen.

Känd avvägning: neutraliseringen kan ge en lätt klumpig upprepning av bolagsnamnet
("Acme AB hjälper Acme ABs kunder"). Det är medvetet — deterministiskt och tredje-
person slår första-person. Den eleganta fixen (LLM som skriver om subjektet) hör
hemma uppströms i GENERATE_PROMPT; den här grinden är skyddsnätet.
"""
from __future__ import annotations

import re

# Svenska första-persons-markörer (företagsröst). Längre former först är inte nödvändigt
# — \b-gränserna håller "våra" isär från "vår" — men ordningen skadar inte.
_FIRST_PERSON = re.compile(r"\b(våra|vårt|vår|oss|vi)\b", re.IGNORECASE)
_GENITIVE_FORMS = {"vår", "vårt", "våra"}

# Social-medie-mätvärden (fåfänge). \w* fångar böjningar: följare/följarna/följarantal.
# Medvetet INTE "besökare"/"engagemang" — för breda, riskerar att fälla äkta affärsclaims
# (besökardemografi hanteras dessutom i attested_ingest, utanför den här grinden).
_SOCIAL_METRIC = re.compile(
    r"\b("
    r"följar\w*"                         # följare, följarna, följarantal, följarbas
    r"|likes?"
    r"|gillning\w*|gilla-?markering\w*"   # gillningar, gilla-markeringar
    r"|delning\w*"                        # delningar
    r"|prenumerant\w*|abonnent\w*"        # prenumeranter, abonnenter
    r"|reaktion\w*"                       # reaktioner
    r")\b",
    re.IGNORECASE,
)

# Fåfänge-KVANTITET: "hundratals/tusentals … följer/följare". Fångar verbformen
# ("hundratals ledare … följer oss") som noun-mönstret missar — utan att flagga
# legitimt "följer GDPR" (inget kvantitetsord). Närhetsfönster håller det tajt.
_VANITY_COUNT = re.compile(
    r"\b(hundratals|tusentals|tiotals|tusen|flera tusen|miljoner)\b.{0,60}?\bfölj",
    re.IGNORECASE | re.DOTALL,
)


def mentions_social_metric(statement: str) -> bool:
    """True om påståendet handlar om ett social-medie-mätvärde (följare/likes/…) eller
    är ett fåfänge-skryt om antal följare. Sådana claims kasseras — de är fåfänge, inte
    fakta. OBS: attesterad demografi ("X % av LinkedIn-följarna är …") matchar också
    noun-mönstret men är LEGITIM — anroparen (compilern) undantar den separat."""
    s = statement or ""
    return bool(_SOCIAL_METRIC.search(s) or _VANITY_COUNT.search(s))


def neutralize(statement: str, company: str) -> str:
    """Byt företags-första-person mot bolagsnamnet i tredje person. Saknas bolagsnamn
    lämnas texten orörd (hellre oneutraliserad än felaktig)."""
    company = (company or "").strip()
    if not company or not statement:
        return statement
    genitive = _genitive(company)

    def repl(m: re.Match) -> str:
        return genitive if m.group(1).lower() in _GENITIVE_FORMS else company

    return re.sub(r"\s+", " ", _FIRST_PERSON.sub(repl, statement)).strip()


def _genitive(name: str) -> str:
    """Svensk genitiv: namn på s/x/z tar ingen extra ändelse (Atlas → Atlas),
    övriga får -s (Acme AB → Acme ABs)."""
    return name if name[-1:].lower() in {"s", "x", "z"} else name + "s"
