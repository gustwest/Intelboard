"""Crawl-health (P2, passivt lager): hämtar AI-motorernas crawlers vår sanningssida?

delivery_health svarar på "är sidan publicerad & installerad" (aktiv pull). Det här
lagret svarar på nästa fråga i kausalkedjan — "blir den FAKTISKT läst" — genom passiv
observation av vem som hämtar profilen.

Källa = GCS usage-loggar (CSV) för CDN-bucketen. Mellanvägen (objekten serveras med
`no-cache`, cache-mode USE_ORIGIN_HEADERS) gör att varje crawler-request når GCS-origin
och hamnar i loggen. Underräkning kan i teorin ske om CDN ändå serverar något cachat,
men no-cache minimerar det.

`aggregate_rows` / `build_doc` är RENA (testbara utan nät). `read_recent_usage_rows` gör
GCS-I/O och no-op:ar tyst om usage-log-bucketen inte är konfigurerad.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Iterator
from urllib.parse import unquote

from config import settings
from services import crawler_agents

log = logging.getLogger(__name__)

# Usage-loggobjekt heter "<prefix>_usage_<timestamp>_<id>_v0"; storage-loggarna
# "<prefix>_storage_…". Vi vill bara åt usage-loggarna (per-request, med user-agent).
_USAGE_MARKER = "_usage_"


def client_from_object(cs_object: str | None) -> str | None:
    """Plocka klient-id ur en loggad objektväg. Hanterar både clean-URL-läget
    (``TheInsidersHubAB/index.html``) och path-style (``clients/<id>/index.html``).
    robots.txt/sitemap.xml och annat utan kund-segment → None."""
    if not cs_object:
        return None
    path = unquote(cs_object).lstrip("/")
    parts = [p for p in path.split("/") if p]
    if not parts:
        return None
    if parts[0] == "clients" and len(parts) >= 2:
        return parts[1]
    if len(parts) >= 2:  # kräver <segment>/<fil> — en bar fil i roten är ingen kund
        return parts[0]
    return None


def _artifact(cs_object: str | None) -> str:
    """Filnamnet (index.html/schema.json/llms.txt) ur objektvägen."""
    if not cs_object:
        return ""
    return unquote(cs_object).rstrip("/").rsplit("/", 1)[-1]


def aggregate_rows(
    rows: Iterable[dict[str, str]],
    known_client_ids: set[str],
    *,
    now_micros: int | None = None,
) -> dict[str, dict[str, Any]]:
    """Rena aggregeringen: usage-loggrader → {client_id: aggregat}.

    En rad räknas om den är (1) en GET, (2) lyckad (2xx/304 — 304 = revalidering, dvs
    botten kollade sidan), (3) från en känd AI-bot-UA, och (4) mot ett känt kund-objekt.
    """
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        method = (row.get("cs_method") or "").upper()
        if method and method != "GET":
            continue
        status = (row.get("sc_status") or "").strip()
        if status and not (status.startswith("2") or status == "304"):
            continue
        ident = crawler_agents.identify(row.get("cs_user_agent"))
        if not ident:
            continue
        bot, category = ident
        cid = client_from_object(row.get("cs_object"))
        if cid is None or cid not in known_client_ids:
            continue
        try:
            micros = int(row.get("time_micros") or 0)
        except (ValueError, TypeError):
            micros = 0

        client = out.setdefault(cid, {"per_bot": {}, "total_hits": 0, "last_crawl_micros": 0})
        client["total_hits"] += 1
        client["last_crawl_micros"] = max(client["last_crawl_micros"], micros)

        b = client["per_bot"].setdefault(
            bot, {"hits": 0, "last_seen_micros": 0, "category": category, "artifacts": set()}
        )
        b["hits"] += 1
        b["last_seen_micros"] = max(b["last_seen_micros"], micros)
        art = _artifact(row.get("cs_object"))
        if art:
            b["artifacts"].add(art)
    return out


def _micros_to_iso(micros: int) -> str | None:
    if not micros:
        return None
    return datetime.fromtimestamp(micros / 1_000_000, tz=timezone.utc).isoformat()


def build_doc(client_agg: dict[str, Any] | None, window_days: int, *, now_iso: str) -> dict[str, Any]:
    """Aggregat (eller None för en kund utan träffar) → Firestore-dokument.
    En kund utan träffar får ett 0-dokument så frontend kan visa 'Inväntar första crawl'
    i stället för att se ut som att mätningen saknas."""
    per_bot: dict[str, Any] = {}
    if client_agg:
        for bot, b in client_agg["per_bot"].items():
            per_bot[bot] = {
                "hits": b["hits"],
                "last_seen": _micros_to_iso(b["last_seen_micros"]),
                # owner = vänligt ägarnamn (ON7). Frontend har sin egen rikare mappning och
                # leder med den; detta är en stabil server-side-version (rapport/mejl).
                "owner": crawler_agents.owner_of(bot),
                "category": b["category"],
                "artifacts": sorted(b["artifacts"]),
            }
    return {
        "window_days": window_days,
        "updated_at": now_iso,
        "total_hits": client_agg["total_hits"] if client_agg else 0,
        "last_crawl_at": _micros_to_iso(client_agg["last_crawl_micros"]) if client_agg else None,
        "bots_seen": len(per_bot),
        "per_bot": per_bot,
    }


def read_recent_usage_rows(
    window_days: int = 30,
    *,
    bucket_name: str | None = None,
    storage_client: Any | None = None,
    now: datetime | None = None,
) -> Iterator[dict[str, str]]:
    """Läs usage-loggrader från de senaste ``window_days`` dagarna. Tyst no-op (tom)
    om ingen usage-log-bucket är konfigurerad. ``storage_client``/``now`` injicerbara i test."""
    bucket_name = bucket_name or settings.usage_log_bucket
    if not bucket_name:
        log.info("crawl-health: ingen usage-log-bucket konfigurerad — hoppar över")
        return
    if storage_client is None:
        from google.cloud import storage
        storage_client = storage.Client()
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=window_days)

    bucket = storage_client.bucket(bucket_name)
    for blob in storage_client.list_blobs(bucket, prefix="usage"):
        if _USAGE_MARKER not in blob.name:
            continue
        created = getattr(blob, "time_created", None)
        if created is not None and created < cutoff:
            continue
        try:
            text = blob.download_as_text()
        except Exception as exc:  # en trasig loggfil får inte fälla jobbet
            log.warning("crawl-health: kunde ej läsa %s: %s", blob.name, exc)
            continue
        yield from csv.DictReader(io.StringIO(text))
