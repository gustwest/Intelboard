"""Tidsstyrd avklingning av kapabilitets-claims (spec §3.2–3.3).

När en platsannons stängs raderas inte kompetenserna direkt — de blir en historisk
grundlinje vars tillitspoäng (confidence) sjunker med tiden sedan stängningen:

    0–6 mån sedan stängning   → 1.0  (fullt bevisad kapacitet i huset)
    6–12 mån                  → 0.7  (antas finnas kvar, mindre aktiv)
    12–24 mån                 → 0.4  (svag signal)
    > 24 mån                  → SUNSET (0.0 → härleds inte, hard-deletas)

Funktionerna är rena: `closed_at` får vara datetime eller ISO-sträng, `now`
injiceras i test. Dual-source-bumpen (XML + LinkedIn → 1.0, spec §4.3) läggs på i
Slice 4 ovanpå den här baslinjen.
"""
from __future__ import annotations

from datetime import datetime, timezone

# (övre gräns i månader, vikt). Första bucket vars gräns ej passerats vinner.
_DECAY_BUCKETS: tuple[tuple[float, float], ...] = ((6.0, 1.0), (12.0, 0.7), (24.0, 0.4))
SUNSET_MONTHS = 24.0
_DAYS_PER_MONTH = 30.4375  # genomsnittlig kalendermånad


def months_since(closed_at: datetime | str, now: datetime | None = None) -> float:
    """Antal månader (decimaltal) sedan stängningen. Aldrig negativt."""
    closed = _to_dt(closed_at)
    ref = now or datetime.now(timezone.utc)
    ref = _aware(ref)
    elapsed_days = (ref - _aware(closed)).total_seconds() / 86400.0
    return max(0.0, elapsed_days / _DAYS_PER_MONTH)


def decay_weight(closed_at: datetime | str, now: datetime | None = None) -> float:
    """Tillitsvikt för en stängd kompetens. 0.0 = sunset (ska inte härledas)."""
    months = months_since(closed_at, now)
    for limit, weight in _DECAY_BUCKETS:
        if months < limit:
            return weight
    return 0.0


def is_sunset(closed_at: datetime | str, now: datetime | None = None) -> bool:
    """True när annonsen passerat 24 mån → noden ska hard-deletas (spec §3.3)."""
    return months_since(closed_at, now) >= SUNSET_MONTHS


def skill_confidence(
    closed_at: datetime | str | None, dual_source: bool = False, now: datetime | None = None
) -> float:
    """Slutgiltig tillitsvikt för en kompetens i kunskapsgrafen (spec §3 + §4.3).

    Matchning i BÅDE XML- och LinkedIn-connectorn ("Dual-Source Truth") ger högsta
    prioritet (1.0) och re-verifierar kompetensen — den klingar inte av och undgår
    sunset. Annars: en aktiv annons (closed_at=None) väger 1.0, en stängd klingar av.
    """
    if dual_source:
        return 1.0
    if closed_at is None:
        return 1.0
    return decay_weight(closed_at, now)


def _to_dt(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _aware(dt: datetime) -> datetime:
    """Naiva tidsstämplar antas vara UTC (Firestore lagrar UTC)."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
