"""Starta Cloud Run Job-executions med override (Fas #2 — permanent per-kund-trigger).

Cloud Run Admin API v2 stödjer execution-overrides (args + taskCount). Vi anropar
REST-endpointen DIREKT — gcloud-CLI:t (549.0.0) skickar ett extra `priorityTier`-
fält som regional endpoint avvisar, men det är ett gcloud-bug, inte ett API-bug.
Genom att bygga payloaden själva undviker vi det helt.

Använd detta för tunga per-kund-körningar (warmth-probes) som annars skulle köra
CPU-strypta i en FastAPI BackgroundTask. En Cloud Run Job-execution har garanterad
CPU och egen livscykel (ingen request-timeout).

Best-effort: returnerar None om Admin API inte är nåbart (lokal utveckling, test,
saknade creds) → anroparen faller tillbaka till BackgroundTask. Kastar aldrig.
"""
from __future__ import annotations

import logging
from typing import Any

from config import settings

log = logging.getLogger(__name__)

# Cloud Run JOBS körs i europe-north1 (services likaså; Vertex i west1).
JOBS_REGION = "europe-north1"
_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def run_job(
    job_name: str,
    args: list[str] | None = None,
    task_count: int | None = None,
    timeout: float = 30.0,
) -> str | None:
    """Starta en Cloud Run Job-execution med valfri override.

    args: ERSÄTTER containerns args helt (inte append) — inkludera därför hela
          kommandot, t.ex. ["-m", "jobs.warmth_probes", "--client-id", "X"].
    task_count: override av antal tasks (t.ex. 1 för riktad enskild-kund-körning
          mot ett annars sharded jobb).

    Returnerar operation-/execution-namnet vid lyckad start, annars None
    (anroparen faller tillbaka till annan exekveringsväg). Loggar men kastar aldrig.
    """
    if not settings.gcp_project:
        return None
    try:
        from google.auth import default as gauth_default
        from google.auth.transport.requests import Request as GAuthRequest
        import httpx

        creds, _ = gauth_default(scopes=[_SCOPE])
        creds.refresh(GAuthRequest())

        url = (
            f"https://run.googleapis.com/v2/projects/{settings.gcp_project}"
            f"/locations/{JOBS_REGION}/jobs/{job_name}:run"
        )
        overrides: dict[str, Any] = {}
        container_override: dict[str, Any] = {}
        if args is not None:
            container_override["args"] = args
        if container_override:
            overrides["containerOverrides"] = [container_override]
        if task_count is not None:
            overrides["taskCount"] = task_count
        body: dict[str, Any] = {"overrides": overrides} if overrides else {}

        resp = httpx.post(
            url, json=body,
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json() or {}
        # :run returnerar en long-running Operation; namnet räcker som bekräftelse.
        name = data.get("name") or (data.get("metadata") or {}).get("name")
        log.info("Cloud Run job '%s' startad via Admin API: %s", job_name, name)
        return name or "started"
    except Exception as exc:  # noqa: BLE001 — start får aldrig fälla anroparen
        log.warning(
            "Cloud Run job-start misslyckades för '%s' (%s) — anroparen faller tillbaka",
            job_name, exc,
        )
        return None
