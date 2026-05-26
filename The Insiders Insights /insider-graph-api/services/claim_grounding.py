"""Deterministisk källgrind för narrative-claims (modelloberoende kvalitetssäkring).

Den verkliga risken är att publicera OSTÖDDA claims. LLM:en *föreslår* — den här grinden
*avgör*, utan en andra modell, och fungerar därför oavsett vilken LLM (EU eller ej) som körs.
Två krav, båda måste hålla:

  1. CITERAT KÄLLSPANN: claimet måste ange ett verbatim-spann (`quote`) som faktiskt finns i
     källtexten. Vi matchar normaliserat (gemener + ihopdragna icke-alfanumeriska tecken) så
     skillnader i blanksteg/skiljetecken inte fäller ett äkta citat, men ett påhittat citat
     fastnar.
  2. SIFFER-GRUNDNING: varje tal i påståendet (årtal, procent, belopp) måste återfinnas i
     källtexten. Hallucinerade siffror är den vanligaste och farligaste claim-defekten.

Ingen LLM, inga nätverksanrop — ren textverifiering. Se docs/claims-provenance-spec.md.
"""
from __future__ import annotations

import re

# Minsta meningsfulla citatlängd (normaliserat) — kortare "spann" är inte bevis nog.
MIN_QUOTE_CHARS = 12


def _normalize(text: str) -> str:
    """Gemener + alla icke-alfanumeriska tecken (inkl. å/ä/ö behålls) → enkelt blanksteg."""
    return re.sub(r"[^0-9a-zåäöéèüA-ZÅÄÖÉÈÜ]+", " ", (text or "").lower()).strip()


def _numbers(text: str) -> list[str]:
    """Sifferkärnor ur en text: 2023, 40, 1.5, 1,5 → '15' normaliseras bort tusentalstecken.
    Returnerar normaliserade siffersträngar (decimaltecken bevaras som punkt)."""
    out: list[str] = []
    for raw in re.findall(r"\d[\d\s.,]*\d|\d", text or ""):
        # Ta bort tusentalsavgränsare/blanksteg; normalisera komma-decimal → punkt.
        cleaned = raw.replace(" ", "")
        # Heuristik: om både , och . finns är , tusental; annars , = decimal.
        if "," in cleaned and "." in cleaned:
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(",", ".")
        cleaned = cleaned.strip(".")
        if cleaned:
            out.append(cleaned)
    return out


def verify(statement: str, quote: str | None, source_text: str) -> tuple[bool, str]:
    """Returnerar (ok, skäl). ok=True endast om citatet finns i källan OCH alla tal i
    påståendet återfinns i källan."""
    statement = (statement or "").strip()
    quote = (quote or "").strip()
    if not statement:
        return False, "tomt påstående"

    norm_source = _normalize(source_text)
    norm_quote = _normalize(quote)

    # 1. Citerat källspann måste finnas i källan.
    if len(norm_quote) < MIN_QUOTE_CHARS:
        return False, "saknar citerat källspann (quote)"
    if norm_quote not in norm_source:
        return False, "citerat spann finns inte i källtexten"

    # 2. Varje tal i påståendet måste återfinnas i källan.
    source_numbers = set(_numbers(source_text))
    for n in _numbers(statement):
        if n not in source_numbers:
            return False, f"talet '{n}' i påståendet saknas i källan"

    return True, "ok"
