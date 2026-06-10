"""Namn→kön-estimering ur SCB:s namnstatistik — lokal, deterministisk, EU-intern.

Grund för GEO Parity Index Fas 0 (docs/parity-index-spec.md): pariteten i hur
AI-motorer porträtterar ett bolag mäts på personer motorerna själva namnger, och
könet estimeras statistiskt ur förnamnet i stället för att kräva uppladdade
personallistor med könsfält.

Designval (DPA-styrda, se spec §"DPA-efterlevnad"):
- Uppslag sker in-process mot en buntad datafil (data/scb_fornamn_2022.csv.gz,
  148k förnamn med antal folkbokförda bärare per kön, frusen serie 2022-12-31).
  Inga namn lämnar processen — inga externa API-anrop (genderize/Namsor är
  US-routade och vore en tredjelandsöverföring av personnamn).
- estimate() returnerar P(kvinna) som sannolikhet, INTE en hård klassning.
  Aggregatet ska sannolikhetsvägas (summera p över nämnda personer) — mer
  korrekt för små urval och för genuint unisexa namn (Kim ≈ 0.28).
- Okända namn (utländska, stavningsvarianter, under bärar-golvet) → None.
  Anroparen räknar dem i parity_unknown_share i stället för att gissa.

Modulen håller ingen personuppgift i vila: datafilen är offentlig statistik,
och inkommande namn varken loggas eller persisteras här.
"""
from __future__ import annotations

import csv
import gzip
import logging
import threading
import unicodedata
from pathlib import Path

log = logging.getLogger(__name__)

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "scb_fornamn_2022.csv.gz"

# Namn med färre totala bärare än detta golv behandlas som okända — enstaka
# bärare ger ingen statistiskt meningsfull könsfördelning.
MIN_BEARERS = 5

_lock = threading.Lock()
_table: dict[str, tuple[int, int]] | None = None  # namn → (kvinnor, män)


def _load() -> dict[str, tuple[int, int]]:
    global _table
    if _table is None:
        with _lock:
            if _table is None:  # double-checked — polling kör i trådpool
                table: dict[str, tuple[int, int]] = {}
                with gzip.open(_DATA_PATH, "rt", encoding="utf-8") as f:
                    for row in csv.reader(f):
                        table[row[0]] = (int(row[1]), int(row[2]))
                _table = table
                log.info("name_gender: %d förnamn laddade från SCB-data", len(table))
    return _table


def _first_name(name: str) -> str:
    """Första förnamnet ur ett (eventuellt fullt) namn, normaliserat som datafilen.

    "Anna Svensson" → "anna", "Eva-Lena Berg" → "eva-lena" (bindestreckade namn
    finns som egna poster i SCB-datan). Omgivande skiljetecken trimmas så att
    NER-artefakter som "Anna," eller citattecken inte sänker träffsäkerheten.
    """
    token = name.strip().split()[0] if name.strip() else ""
    token = token.strip(".,;:!?\"'()[]")
    return unicodedata.normalize("NFC", token).casefold()


def estimate(name: str) -> float | None:
    """P(kvinna) för personens förnamn, eller None om namnet är okänt.

    0.0 ≈ säkert man, 1.0 ≈ säkert kvinna, däremellan unisex. None betyder
    "räkna som okänd" (utländskt namn, för få bärare, tom sträng) — aldrig
    en gissning."""
    key = _first_name(name)
    if not key:
        return None
    counts = _load().get(key)
    if counts is None:
        return None
    women, men = counts
    total = women + men
    if total < MIN_BEARERS:
        return None
    return women / total


def aggregate(names: list[str]) -> dict[str, float | int | None]:
    """Sannolikhetsvägt paritetsaggregat över en lista namn (t.ex. AI-nämnda).

    Returnerar:
      parity      — vägd andel kvinnor bland namn som kunde estimeras (None om 0)
      n           — antal namn som ingick i estimatet
      unknown_share — andel av inkommande namn som inte kunde estimeras

    Endast aggregatet är tänkt att persisteras — aldrig namnen eller per-namn-
    estimaten (DPA: dataminimering, anonymt aggregat)."""
    probs = [p for p in (estimate(n) for n in names) if p is not None]
    total_in = len(names)
    n = len(probs)
    return {
        "parity": (sum(probs) / n) if n else None,
        "n": n,
        "unknown_share": ((total_in - n) / total_in) if total_in else 0.0,
    }
