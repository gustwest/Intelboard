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

log = logging.getLogger("jobs.run_tracker")


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

    try:
        yield handle
    except Exception as exc:  # jobbet kraschade
        if doc is not None:
            _finish(doc, started, "failed", handle.summary, str(exc)[:500])
        raise
    else:
        if doc is not None:
            _finish(doc, started, "success", handle.summary, None)


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


def tracked(job_type: str, client_id: str | None, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Hjälpare för call sites som inte enkelt kan använda `with` (t.ex. en
    BackgroundTask som annars anropar en service-funktion direkt)."""
    with record_run(job_type, client_id):
        return fn(*args, **kwargs)
