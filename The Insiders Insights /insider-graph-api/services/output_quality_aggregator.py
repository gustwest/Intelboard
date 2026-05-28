"""Per-connector-aggregat över output_quality_logs — driver promotion-beslut.

Läser shadow- och gate-loggar och bygger en sammanställning som svarar på
*den enda relevanta frågan här*: vilken connector ska promote:as från shadow
till active gate härnäst?

Beslutskriteriet (steg 4 → 5-rolloutens "promotion-kriterium"):
  * avg_score < `PROMOTION_SCORE_THRESHOLD` (2.5) OCH
  * minst `PROMOTION_MIN_CLAIMS` (30) claims i fönstret → tillräckligt med data
  * redundans- eller missing_persona-flaggor adderar tyngd

Aggregatet är cross-client som default (helhetsbilden) men kan filtreras per
kund via `client_id` när vi vill se ENBART en kunds output-kvalitet.

Inga sideffekter — bara läsning. Endpointen (routers/output_quality.py) cacha:r
inte; aggregeringen körs lazy vid varje anrop. Bör vara billig (få docs).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

import firestore_client as fs

log = logging.getLogger(__name__)

DEFAULT_WINDOW_DAYS = 14
PROMOTION_SCORE_THRESHOLD = 2.5
PROMOTION_MIN_CLAIMS = 30
TOP_ORIGINS = 3


def aggregate_connector_scores(
    *, client_id: str | None = None, window_days: int = DEFAULT_WINDOW_DAYS,
) -> dict[str, Any]:
    """Aggregera output_quality_logs per connector. None client_id = cross-client.

    Returnerar:
      {
        "window_days": int,
        "client_id": str | None,
        "connectors": [
            {connector, claim_count, avg_score, drop_rate, transform_rate, publish_rate,
             redundant_flag_count, n_clients, top_origins, promotion_candidate,
             first_seen_at, last_seen_at}
        ],
        "log_count": int,
      }
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    cutoff_iso = cutoff.isoformat()

    # Per-connector ackumulatorer
    acc: dict[str, dict[str, Any]] = defaultdict(_empty_bucket)
    log_count = 0

    for cid, log_id, log_doc in _iter_logs(client_id):
        logged_at = log_doc.get("logged_at") or ""
        if logged_at and logged_at < cutoff_iso:
            continue
        log_count += 1

        for connector, conn_data in (log_doc.get("per_connector") or {}).items():
            _absorb_shadow(acc[connector], cid, logged_at, conn_data)

        # Gate-loggar har inte per_connector-strukturen (de gäller en specifik connector
        # = linkedin_capacity, scope=demographics). Räkna in dem på den connectorn.
        if log_doc.get("source") == "gate" and log_doc.get("connector"):
            _absorb_gate(acc[log_doc["connector"]], cid, logged_at, log_doc)

        # Redundans-flaggor på bundle-nivå — knyt till alla connectors som finns i loggen.
        red_count = sum(
            1 for f in (log_doc.get("bundle_flags") or [])
            if f.get("type") == "high_redundancy"
        )
        if red_count:
            for connector in (log_doc.get("per_connector") or {}):
                acc[connector]["redundant_flag_count"] += red_count

    connectors = [_finalize(connector, bucket) for connector, bucket in acc.items()]
    connectors.sort(key=lambda c: (c["avg_score"], -c["claim_count"]))

    return {
        "window_days": window_days,
        "client_id": client_id,
        "connectors": connectors,
        "log_count": log_count,
    }


# --- Logg-iteration ----------------------------------------------------------


def _iter_logs(client_id: str | None) -> Iterator[tuple[str, str, dict[str, Any]]]:
    """Yield (client_id, log_id, log_doc) för loggar i scope."""
    if client_id:
        for log_id, data in fs.iter_output_quality_logs(client_id):
            yield client_id, log_id, data
        return
    for cid, _ in fs.iter_clients():
        for log_id, data in fs.iter_output_quality_logs(cid):
            yield cid, log_id, data


# --- Ackumulering ------------------------------------------------------------


def _empty_bucket() -> dict[str, Any]:
    return {
        "claim_count": 0,
        "score_sum": 0.0,
        "action_counts": defaultdict(int),
        "origins": defaultdict(int),
        "clients": set(),
        "redundant_flag_count": 0,
        "first_seen_at": None,
        "last_seen_at": None,
    }


def _absorb_shadow(bucket: dict[str, Any], cid: str, logged_at: str, conn_data: dict[str, Any]) -> None:
    n = int(conn_data.get("claim_count") or 0)
    if n <= 0:
        return
    bucket["claim_count"] += n
    avg = float(conn_data.get("avg_score") or 0.0)
    bucket["score_sum"] += avg * n
    for action, count in (conn_data.get("action_counts") or {}).items():
        bucket["action_counts"][action] += int(count)
    for origin, count in (conn_data.get("origins") or {}).items():
        bucket["origins"][origin] += int(count)
    bucket["clients"].add(cid)
    _bump_seen(bucket, logged_at)


def _absorb_gate(bucket: dict[str, Any], cid: str, logged_at: str, log_doc: dict[str, Any]) -> None:
    actions = log_doc.get("actions") or []
    if not actions:
        return
    n = len(actions)
    bucket["claim_count"] += n
    # Snittpoäng = snitt över per-claim-scoren i actions
    score_sum = sum(a.get("score") or 0.0 for a in actions)
    bucket["score_sum"] += score_sum
    for a in actions:
        bucket["action_counts"][a.get("action") or "publish"] += 1
    bucket["clients"].add(cid)
    _bump_seen(bucket, logged_at)


def _bump_seen(bucket: dict[str, Any], logged_at: str) -> None:
    if not logged_at:
        return
    if bucket["first_seen_at"] is None or logged_at < bucket["first_seen_at"]:
        bucket["first_seen_at"] = logged_at
    if bucket["last_seen_at"] is None or logged_at > bucket["last_seen_at"]:
        bucket["last_seen_at"] = logged_at


# --- Finalisering ------------------------------------------------------------


def _finalize(connector: str, bucket: dict[str, Any]) -> dict[str, Any]:
    n = bucket["claim_count"]
    avg = bucket["score_sum"] / n if n else 0.0
    actions = bucket["action_counts"]
    total_actions = sum(actions.values()) or 1
    top_origins = sorted(bucket["origins"].items(), key=lambda x: -x[1])[:TOP_ORIGINS]

    avg_score = round(avg, 2)
    promotion_candidate = (
        avg_score < PROMOTION_SCORE_THRESHOLD
        and n >= PROMOTION_MIN_CLAIMS
    )

    return {
        "connector": connector,
        "claim_count": n,
        "avg_score": avg_score,
        "drop_rate": round(actions.get("drop", 0) / total_actions, 3),
        "transform_rate": round(actions.get("transform", 0) / total_actions, 3),
        "publish_rate": round(actions.get("publish", 0) / total_actions, 3),
        "redundant_flag_count": bucket["redundant_flag_count"],
        "n_clients": len(bucket["clients"]),
        "top_origins": [{"origin": o, "count": c} for o, c in top_origins],
        "promotion_candidate": promotion_candidate,
        "first_seen_at": bucket["first_seen_at"],
        "last_seen_at": bucket["last_seen_at"],
    }
