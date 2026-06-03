"""Körningsspår för jobben (Fas A).

`record_run` är en context manager som skriver ett dokument till job_runs vid
start (status=running) och uppdaterar det vid slut (success/failed) med
varaktighet, en valfri summering och ev. felmeddelande.

Designprinciper:
- **Får aldrig fälla jobbet.** Alla Firestore-skrivningar är best-effort; om
  spårningen misslyckas loggas det och jobbet fortsätter.
- **Vid undantag i jobbet** registreras `failed` och undantaget re-raisas, så
  befintlig felhantering (t.ex. per-kund-loopar som fångar Exception) beter sig
  oförändrat.
- Spåras per **arbetsenhet**: per kund för kund-scopade jobb, annars globalt
  (client_id=None).

Användning:

    with record_run("compile_schema", client_id) as run:
        ...gör jobbet...
        run.summary = {"changed": True}
"""
from __future__ import annotations

import logging
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterator

from google.cloud import firestore

import firestore_client as fs
from services import ops_alerts, token_meter

log = logging.getLogger("jobs.run_tracker")


def _alert_source(job_type: str, client_id: str | None) -> str:
    """Stabil dedup-nyckel per (jobb, kund). Samma kunds upprepade failures
    samlas i en enda alert; globala jobb (client_id=None) får sin egen ström."""
    return f"{job_type}:{client_id}" if client_id else job_type


class RunHandle:
    """Skickas till `with`-blocket; sätt `.summary` för att bifoga räkningar etc."""

    def __init__(self) -> None:
        self.summary: dict[str, Any] = {}


@contextmanager
def record_run(job_type: str, client_id: str | None = None) -> Iterator[RunHandle]:
    handle = RunHandle()
    started = datetime.now(timezone.utc)
    # Tidsmärkt, sorterbart id → vi kan ordna utan composite-index.
    run_id = f"{started.strftime('%Y%m%dT%H%M%S%f')}-{uuid.uuid4().hex[:6]}"

    # Hämta doc-referensen och skriv start inom samma try: spårningen får aldrig
    # fälla jobbet, inte ens om Firestore är helt otillgängligt.
    doc = None
    try:
        doc = fs.job_run_doc(run_id)
        doc.set(
            {
                "job_type": job_type,
                "client_id": client_id,
                "status": "running",
                "started_at": firestore.SERVER_TIMESTAMP,
                # TTL: Firestore raderar posten ~90 dagar efter körningen (kräver att
                # en TTL-policy är aktiverad på fältet expire_at för job_runs).
                "expire_at": datetime.now(timezone.utc) + timedelta(days=90),
            }
        )
    except Exception:  # noqa: BLE001
        log.exception("job_runs: kunde inte skriva start (%s/%s)", job_type, client_id)
        doc = None

    with token_meter.measure(client_id=client_id) as meter:
        try:
            yield handle
        except Exception as exc:  # jobbet kraschade
            handle.summary = {**(handle.summary or {}), "tokens": meter.to_dict()}
            if doc is not None:
                _finish(doc, started, "failed", handle.summary, str(exc)[:500])
            # Öppna/uppdatera en ops-alert som syns i inboxen. Dedup på
            # (job_type, client_id) → upprepade failures räknar upp samma alert
            # i stället för att spamma. Best-effort: alertsystemet får aldrig
            # fälla jobbets felhantering.
            try:
                ops_alerts.raise_alert(
                    kind="job_failed",
                    source=_alert_source(job_type, client_id),
                    title=f"{job_type} failed" + (f" för {client_id}" if client_id else ""),
                    detail=str(exc)[:500],
                    severity=ops_alerts.SEVERITY_WARNING,
                    client_id=client_id,
                    last_message=str(exc)[:500],
                )
            except Exception:  # noqa: BLE001
                log.exception("ops_alerts.raise_alert failed for %s/%s", job_type, client_id)
            raise
        else:
            handle.summary = {**(handle.summary or {}), "tokens": meter.to_dict()}
            if doc is not None:
                _finish(doc, started, "success", handle.summary, None)
            # Lyckad körning → auto-stäng ev. öppen job_failed-alert för samma
            # (jobb, kund). Om ingen alert finns blir det en tyst no-op.
            try:
                ops_alerts.maybe_resolve(
                    kind="job_failed",
                    source=_alert_source(job_type, client_id),
                    resolved_by="auto:success",
                )
            except Exception:  # noqa: BLE001
                log.exception("ops_alerts.maybe_resolve failed for %s/%s", job_type, client_id)


def _finish(
    doc: Any, started: datetime, status: str, summary: dict[str, Any], error_message: str | None
) -> None:
    duration = round((datetime.now(timezone.utc) - started).total_seconds(), 2)
    try:
        doc.set(
            {
                "status": status,
                "ended_at": firestore.SERVER_TIMESTAMP,
                "duration_seconds": duration,
                "summary": summary or {},
                "error_message": error_message,
            },
            merge=True,
        )
    except Exception:  # noqa: BLE001
        log.exception("job_runs: kunde inte skriva slutstatus (%s)", status)


def log_event(kind: str, client_id: str | None = None, summary: dict[str, Any] | None = None) -> None:
    """Logga en AFFÄRSHÄNDELSE (rapport genererad, underlag verifierat, claim godkänt …) i
    SAMMA körningsspår (job_runs) som jobben, så kund-tidslinjen och aktivitetsflödet får med
    den utan en parallell logg. Ögonblicklig (ingen running→klar-cykel): status="success",
    duration 0, job_type=`event:<kind>`. Best-effort — får aldrig fälla anroparen."""
    started = datetime.now(timezone.utc)
    run_id = f"{started.strftime('%Y%m%dT%H%M%S%f')}-{uuid.uuid4().hex[:6]}"
    try:
        fs.job_run_doc(run_id).set(
            {
                "job_type": f"event:{kind}",
                "client_id": client_id,
                "status": "success",
                "started_at": firestore.SERVER_TIMESTAMP,
                "ended_at": firestore.SERVER_TIMESTAMP,
                "duration_seconds": 0,
                "summary": summary or {},
                "expire_at": started + timedelta(days=90),
            }
        )
    except Exception:  # noqa: BLE001
        log.exception("job_runs: kunde inte logga händelse %s (%s)", kind, client_id)


def tracked(job_type: str, client_id: str | None, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Hjälpare för call sites som inte enkelt kan använda `with` (t.ex. en
    BackgroundTask som annars anropar en service-funktion direkt)."""
    with record_run(job_type, client_id):
        return fn(*args, **kwargs)
