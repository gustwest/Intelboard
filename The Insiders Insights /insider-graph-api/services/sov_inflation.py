"""F2 — Synlighetsinflation: hur mycket av Share of Voice som drivs av frågeinramning.

De ordinarie battericellerna är ledande-inramade ("de *ledande*/*bästa* bolagen inom
{industry}?"). Superlativ/ranking primar motorn på konkurrenslandskapet och kan blåsa upp
hur ofta kunden nämns. Kontrollfrågorna (services/polling.py:CONTROL_QUESTIONS) ställer
samma domän neutralt. Skillnaden i nämn-frekvens = inflationen.

En enskild vecka är för brusig för att uttala sig om (få frågor × motorer). Den här
modulen summerar över de senaste kontrollbärande veckorna och grindar på underlag: under
MIN_WEEKS veckor rapporteras "samlar data", aldrig en tvärsäker siffra. Detta är den
kanoniska beräkningen — routern (cockpiten) och eventuell rapport läser HÄRIFRÅN, så att
inflationssiffran är ett enda mått överallt.

Måttet är en ops-/mätkvalitetssignal (en läsanvisning för SoV), inte en kundinsikt — det
bor i den interna cockpiten, inte i den externa månadsrapporten.
"""
from __future__ import annotations

from typing import Any

# Minst så många kontrollbärande veckor innan vi rapporterar en siffra. Under detta är
# run-to-run-bruset större än en trolig inflationssignal — vi säger "samlar data" i stället.
MIN_WEEKS = 4
# Fönster: medelvärdet räknas på de senaste N kontrollbärande veckorna, så att gammal data
# inte dominerar när inramning/kontext ändrats. Räcker historiken inte till används det som finns.
WINDOW = 8

# Inflationsnivåer i procentenheter (skillnad batteri-SoV − kontroll-SoV).
_MODERATE_PP = 5.0
_HIGH_PP = 15.0


def _control_weeks(weeks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Veckor med användbart inflationsunderlag (kontroll- OCH batterifrågor faktiskt mätta),
    nyast först. Robust mot veckor före omläggningen (saknar framing_inflation)."""
    usable = []
    for w in weeks or []:
        fi = w.get("framing_inflation")
        if not isinstance(fi, dict):
            continue
        if (fi.get("control_n") or 0) <= 0 or (fi.get("framed_n") or 0) <= 0:
            continue
        usable.append(w)
    usable.sort(key=lambda w: w.get("week_id") or "", reverse=True)
    return usable


def _level(delta_pp: float) -> str:
    if delta_pp < _MODERATE_PP:
        return "none"
    if delta_pp < _HIGH_PP:
        return "moderate"
    return "high"


def summarize(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    """Summera synlighetsinflationen över de kontrollbärande veckorna.

    `weeks` = veckodicts som routern bygger (var och en kan bära `framing_inflation`).
    Returnerar alltid en dict med `status` ∈ {collecting, no_inflation, ready} och en
    färdig svensk `insight`-mening — UI:t behöver aldrig själv tolka siffrorna.
    """
    usable = _control_weeks(weeks)
    k = len(usable)

    if k < MIN_WEEKS:
        return {
            "status": "collecting",
            "weeks_with_control": k,
            "weeks_needed": MIN_WEEKS,
            "insight": (
                f"Samlar kontrolldata för inflationsmåttet: {k}/{MIN_WEEKS} veckor. "
                "Måttet jämför batteriets ledande-inramade frågor med neutrala kontrollfrågor "
                "och blir tillförlitligt först med fler veckor."
            ),
        }

    window = usable[:WINDOW]
    n = len(window)
    avg_framed = sum((w["framing_inflation"].get("framed_sov") or 0.0) for w in window) / n
    avg_control = sum((w["framing_inflation"].get("control_sov") or 0.0) for w in window) / n
    delta = avg_framed - avg_control
    delta_pp = delta * 100.0
    framed_pct = round(avg_framed * 100)
    control_pct = round(avg_control * 100)

    base = {
        "weeks_with_control": k,
        "weeks_needed": MIN_WEEKS,
        "weeks_averaged": n,
        "avg_framed_sov": round(avg_framed, 4),
        "avg_control_sov": round(avg_control, 4),
        "delta_pp": round(delta_pp, 1),
    }

    # Kontroll-SoV ≥ batteri-SoV: ingen inflation — kunden nämns minst lika ofta neutralt.
    if delta_pp < _MODERATE_PP and delta_pp <= 0:
        return {
            **base,
            "status": "no_inflation",
            "level": "none",
            "insight": (
                f"Inget tecken på inflation ({n} veckors snitt): kunden nämns lika ofta på "
                f"neutrala kontrollfrågor ({control_pct}%) som på batteriets ({framed_pct}%). "
                "Synlighetssiffran speglar verklig synlighet, inte frågekonstruktion."
            ),
        }

    level = _level(delta_pp)
    pp = round(delta_pp)
    if level == "none":
        phrasing = f"lyfter synligheten marginellt (~{pp} procentenheter)"
    elif level == "moderate":
        phrasing = f"lyfter den uppmätta synligheten med ~{pp} procentenheter"
    else:
        phrasing = f"blåser upp den uppmätta synligheten kraftigt (~{pp} procentenheter)"

    return {
        **base,
        "status": "ready",
        "level": level,
        "insight": (
            f"Inflationsmått ({n} veckors snitt): ledande-inramade batterifrågor ger "
            f"{framed_pct}% synlighet mot {control_pct}% för neutrala kontrollfrågor — "
            f"frågekonstruktionen {phrasing}. Läs batteriets Share of Voice som ett tak, "
            "inte ett neutralt mått."
        ),
    }
