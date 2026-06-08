"""Systemets klocka — en enda källa för "nu".

Två tidsbegrepp, medvetet åtskilda:

1. INSTANT-tidsstämplar (`*_at`, durations, cutoffs) lagras i UTC. En tidpunkt är
   tidszonsoberoende; UTC är rätt för lagring/överföring och frontend renderar den i
   Stockholm-tid vid visning. Använd `now_utc()` för dessa.

2. KALENDER-härledda värden — vilken MÅNAD en rapport tillhör, vilken DAG en kostnad
   bokförs — måste följa svensk kalender. UTC ligger 1–2 h efter svensk tid, så ett
   `now_utc()`-härlett "%Y-%m"/"%Y-%m-%d" hamnar fel vid dygns-/månadsskiften (t.ex.
   1 juli 00:30 svensk tid = 30 juni 22:30 UTC → "fel" månad). Använd
   `stockholm_month()` / `stockholm_date()` för sådana värden.

Kräver IANA-tz-databasen; `tzdata` ligger i requirements.txt eftersom python:3.12-slim
saknar OS-zonfilerna.
"""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

STOCKHOLM = ZoneInfo("Europe/Stockholm")


def now_utc() -> datetime:
    """Nu som UTC-aware datetime — för instant-tidsstämplar (`*_at`)."""
    return datetime.now(timezone.utc)


def now_stockholm() -> datetime:
    """Nu som Stockholm-aware datetime."""
    return datetime.now(STOCKHOLM)


def stockholm_month() -> str:
    """Innevarande månad (YYYY-MM) enligt svensk kalender."""
    return now_stockholm().strftime("%Y-%m")


def stockholm_date() -> str:
    """Dagens datum (YYYY-MM-DD) enligt svensk kalender."""
    return now_stockholm().strftime("%Y-%m-%d")
