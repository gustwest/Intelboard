"""Cloud Scheduler-status + paus för AI-synlighetsloopens schemalagda jobb.

Läser verkligt ENABLED/PAUSED-läge, senaste/nästa körning, och låter ops pausa
respektive återuppta triggern (Cloud Scheduler API). Endast en kuraterad allowlist
av scheman går att röra — godtyckliga scheduler-namn avvisas.

Kräver att service-accounten har cloudscheduler-behörighet (roles/cloudscheduler.admin).
Saknas behörighet/credentials degraderar API:t till available=false i stället för att krascha.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from config import settings

router = APIRouter(prefix="/api/schedules", tags=["schedules"])
log = logging.getLogger("routers.schedules")

# Kuraterad allowlist: scheduler-namn → (etikett, kadens-text). Speglar scripts/bootstrap.sh.
# Endast AI-synlighetsloopen exponeras här.
SCHEDULES: list[tuple[str, str, str]] = [
    ("polling-weekly-tue", "Polling", "Veckovis · tisdag 06:00"),
    ("risk-detect-weekly-tue", "Risk-detect", "Veckovis · tisdag 07:00"),
    ("monthly-report-monthly", "Månadsrapport", "Månadsvis · 1:a kl 07:00"),
]
_ALLOWED = {name for name, _, _ in SCHEDULES}


def _project() -> str:
    return settings.gcp_project or settings.firestore_project_id


def _client():
    """Lazy-init: importera + skapa klienten först vid anrop (så modulimport aldrig
    faller på saknade credentials). Returnerar None om något saknas."""
    if not _project():
        return None
    try:
        from google.cloud import scheduler_v1

        return scheduler_v1.CloudSchedulerClient()
    except Exception as exc:  # noqa: BLE001
        log.warning("cloud scheduler-klient otillgänglig: %s", exc)
        return None


def _ts(value: Any) -> str | None:
    """Proto-plus Timestamp → iso, eller None om osatt (epoch)."""
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            return None if value.year < 2000 else value.isoformat()
    except Exception:  # noqa: BLE001
        return None
    return None


def _job_path(client, name: str) -> str:
    return client.job_path(_project(), settings.scheduler_location, name)


@router.get("")
def list_schedules() -> dict[str, Any]:
    """Status för AI-synlighetsloopens scheman: läge, senaste/nästa körning, kadens."""
    client = _client()
    if client is None:
        return {"available": False, "reason": "scheduler-API ej tillgängligt", "schedules": []}

    out = []
    for name, label, cadence in SCHEDULES:
        entry: dict[str, Any] = {"name": name, "label": label, "cadence": cadence}
        try:
            job = client.get_job(name=_job_path(client, name))
            entry.update(
                {
                    "state": job.state.name,  # ENABLED / PAUSED / DISABLED / …
                    "paused": job.state.name == "PAUSED",
                    "schedule": job.schedule,
                    "time_zone": job.time_zone,
                    "last_run": _ts(getattr(job, "last_attempt_time", None)),
                    "next_run": _ts(getattr(job, "schedule_time", None)),
                    "exists": True,
                }
            )
        except Exception as exc:  # noqa: BLE001 — schemat kanske inte skapats (bootstrap ej kört)
            log.info("schema %s kunde inte läsas: %s", name, exc)
            entry.update({"state": "MISSING", "paused": False, "exists": False})
        out.append(entry)
    return {"available": True, "location": settings.scheduler_location, "schedules": out}


def _set_paused(name: str, pause: bool) -> dict[str, Any]:
    if name not in _ALLOWED:
        raise HTTPException(404, f"unknown schedule: {name}")
    client = _client()
    if client is None:
        raise HTTPException(503, "scheduler-API ej tillgängligt")
    path = _job_path(client, name)
    try:
        job = client.pause_job(name=path) if pause else client.resume_job(name=path)
    except Exception as exc:  # noqa: BLE001
        log.warning("kunde inte %s schema %s: %s", "pausa" if pause else "återuppta", name, exc)
        raise HTTPException(502, f"scheduler-operation misslyckades: {exc}")
    return {"name": name, "state": job.state.name, "paused": job.state.name == "PAUSED"}


@router.post("/{name}/pause")
def pause_schedule(name: str) -> dict[str, Any]:
    """Pausa triggern — schemaläggaren slutar fyra tills den återupptas."""
    return _set_paused(name, True)


@router.post("/{name}/resume")
def resume_schedule(name: str) -> dict[str, Any]:
    """Återuppta en pausad trigger."""
    return _set_paused(name, False)
