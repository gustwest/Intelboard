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

# F6 — konfidensgrind för paritetsaggregatet. Ett estimat som vilar på få bärare är
# statistiskt opålitligt ÄVEN om proportionen råkar vara skarp (5 bärare 5/0 → "1.0"
# men en enda till bärare kan vippa den). Det är BÄRARTALET, inte unisex-graden, som
# avgör konfidensen — unisexa namn med gott om bärare (Kim) behålls och sannolikhetsvägs,
# precis som modulens grunddesign. Namn mellan MIN_BEARERS och detta tak räknas som
# igenkända men lågkonfidenta och hålls utanför pariteten (spåras i kvalitetsaggregatet
# för NER-audit). Tröskeln är medvetet konservativ — släpper bara genuint tunna estimat.
CONFIDENT_BEARERS = 25

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


def _estimate_detail(name: str) -> tuple[float, int] | None:
    """(P(kvinna), antal bärare) för förnamnet, eller None om okänt/under golvet.
    Bärartalet behövs för F6:s konfidensgrind i aggregate()."""
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
    return women / total, total


def estimate(name: str) -> float | None:
    """P(kvinna) för personens förnamn, eller None om namnet är okänt.

    0.0 ≈ säkert man, 1.0 ≈ säkert kvinna, däremellan unisex. None betyder
    "räkna som okänd" (utländskt namn, för få bärare, tom sträng) — aldrig
    en gissning."""
    detail = _estimate_detail(name)
    return detail[0] if detail is not None else None


def aggregate(names: list[str]) -> dict[str, float | int | None]:
    """Sannolikhetsvägt paritetsaggregat över en lista namn (t.ex. AI-nämnda).

    Returnerar:
      parity      — vägd andel kvinnor bland KONFIDENTA namn (None om 0)
      n           — antal konfidenta namn som ingick i estimatet
      unknown_share — andel inkommande namn som inte kunde estimeras alls (ingen SCB-match)
      recognized  — antal namn som matchade SCB (konfidenta + lågkonfidenta) [F6]
      low_confidence — antal igenkända men lågkonfidenta namn (under CONFIDENT_BEARERS) [F6]
      low_confidence_share — andel av inkommande namn som var lågkonfidenta [F6]

    F6: lågkonfidenta estimat (för få bärare) hålls UTANFÖR pariteten men spåras i
    kvalitetsfälten ovan — ett anonymt NER-/estimat-kvalitetsstickprov för audit, helt
    utan namn. Endast aggregatet persisteras — aldrig namnen eller per-namn-estimaten
    (DPA: dataminimering, anonymt aggregat)."""
    total_in = len(names)
    confident: list[float] = []
    low_conf = 0
    for nm in names:
        detail = _estimate_detail(nm)
        if detail is None:
            continue  # ingen SCB-match → okänd
        p, bearers = detail
        if bearers < CONFIDENT_BEARERS:
            low_conf += 1   # igenkänd men för tunt underlag → utanför pariteten
        else:
            confident.append(p)
    n = len(confident)
    recognized = n + low_conf
    return {
        "parity": (sum(confident) / n) if n else None,
        "n": n,
        "unknown_share": ((total_in - recognized) / total_in) if total_in else 0.0,
        "recognized": recognized,
        "low_confidence": low_conf,
        "low_confidence_share": (low_conf / total_in) if total_in else 0.0,
    }
