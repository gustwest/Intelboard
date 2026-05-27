"""Pytteliten in-memory TTL-cache för dyra läs-aggregeringar (inbox, pipeline).

Per Cloud Run-instans (delas inte mellan instanser) — duger för att dämpa upprepade
tunga anrop (t.ex. headern som hämtar /api/inbox vid varje sidladdning). Kort TTL så
att färskheten inte blir lidande; producer-undantag cachas aldrig.
"""
from __future__ import annotations

import time
from typing import Any, Callable

_store: dict[str, tuple[float, Any]] = {}


def cached(key: str, ttl_seconds: float, producer: Callable[[], Any]) -> Any:
    now = time.monotonic()
    hit = _store.get(key)
    if hit is not None and now - hit[0] < ttl_seconds:
        return hit[1]
    value = producer()  # undantag propagerar och cachas inte
    _store[key] = (now, value)
    return value


def invalidate(prefix: str = "") -> None:
    """Rensa cache-poster (alla, eller de vars nyckel börjar med prefix)."""
    for k in [k for k in _store if k.startswith(prefix)]:
        _store.pop(k, None)
