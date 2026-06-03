"""Post-deploy verifiering — körs som sista steg i båda Cloud Build-pipelinerna.

Snabb (<30 s), idempotent, ingen Firestore-skrivning. Failar exit ≠ 0 om något av
följande gäller:

1. API:t svarar inte 200 på /health, eller `commit_sha` matchar inte $EXPECTED_SHA.
2. Frontend svarar inte 200 på /.
3. Jobb har failat senaste N timmarna (tröskel kan höjas via flag).
4. Något av de kuraterade Cloud Scheduler-jobben är inte ENABLED.
5. Model-registry-endpointen svarar inte med >0 roller.
6. Det finns en öppen critical-larm i ops_alerts yngre än 1 h.

Soft-fail: om FRONTEND_URL eller EXPECTED_SHA saknas hoppas respektive check över
med varning — så att samma skript kan köras manuellt utan Cloud Build-context.

Logik och nätverk är åtskilda — `evaluate_results()` är ren och testbar.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


# --- Ren logik (testbar utan nätverk) ---------------------------------------


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str  # "ok" | "warn" | "fail"
    detail: str


def evaluate_api_health(payload: dict[str, Any] | None, status_code: int, expected_sha: str | None) -> CheckResult:
    if status_code != 200 or not isinstance(payload, dict):
        return CheckResult("api_health", "fail", f"HTTP {status_code}: {payload!r}")
    if payload.get("status") != "ok":
        return CheckResult("api_health", "fail", f"status={payload.get('status')!r}")
    actual = payload.get("commit_sha")
    if expected_sha and actual and actual != expected_sha:
        return CheckResult(
            "api_health",
            "fail",
            f"served SHA {actual!r} ≠ expected {expected_sha!r} — gammal revision serveras fortfarande",
        )
    if expected_sha and not actual:
        return CheckResult("api_health", "warn", "expected SHA satt men /health saknar commit_sha — env inte propagerad än?")
    return CheckResult("api_health", "ok", f"revision={payload.get('revision')} sha={actual}")


def evaluate_frontend_health(status_code: int, url: str | None) -> CheckResult:
    if not url:
        return CheckResult("frontend_health", "warn", "FRONTEND_URL ej satt — skippas")
    if status_code != 200:
        return CheckResult("frontend_health", "fail", f"HTTP {status_code} på {url}")
    return CheckResult("frontend_health", "ok", f"200 på {url}")


def evaluate_job_runs(
    runs: list[dict[str, Any]],
    now: datetime,
    since_hours: int,
    ignore_jobs: tuple[str, ...] = (),
) -> CheckResult:
    """Failed-runs senaste `since_hours`. `ignore_jobs` = job_types som inte räknas
    (för att hantera kända flakiga jobb under inkörning)."""
    cutoff = now - timedelta(hours=since_hours)
    failed: list[dict[str, Any]] = []
    for r in runs:
        if r.get("status") != "failed":
            continue
        if (r.get("job_type") or "") in ignore_jobs:
            continue
        started = _parse_iso(r.get("started_at"))
        if started is None or started < cutoff:
            continue
        failed.append(r)
    if not failed:
        return CheckResult("job_runs", "ok", f"0 failed senaste {since_hours}h")
    summary = ", ".join(f"{r.get('job_type')}/{r.get('client_id') or '-'}" for r in failed[:5])
    return CheckResult("job_runs", "fail", f"{len(failed)} failed senaste {since_hours}h: {summary}")


def evaluate_schedules(payload: dict[str, Any]) -> CheckResult:
    if not payload.get("available"):
        return CheckResult("schedules", "warn", f"scheduler-API otillgängligt: {payload.get('reason')}")
    schedules = payload.get("schedules") or []
    if not schedules:
        return CheckResult("schedules", "fail", "inga scheman returnerade")
    bad: list[str] = []
    for s in schedules:
        if not s.get("exists"):
            bad.append(f"{s.get('name')}=MISSING")
        elif s.get("state") != "ENABLED":
            bad.append(f"{s.get('name')}={s.get('state')}")
    if bad:
        return CheckResult("schedules", "fail", "; ".join(bad))
    return CheckResult("schedules", "ok", f"{len(schedules)} ENABLED")


def evaluate_model_registry(payload: dict[str, Any] | None, status_code: int) -> CheckResult:
    if status_code != 200 or not isinstance(payload, dict):
        return CheckResult("model_registry", "fail", f"HTTP {status_code}")
    # Tolerera båda formaten: {"roles": {...}} eller {"roles": [...]}; om varken
    # finns, anta att hela payloaden ÄR registret (kan vara dict eller list).
    roles = payload.get("roles")
    if roles is None:
        roles = payload.get("registry")
    if roles is None:
        roles = payload
    count = len(roles) if isinstance(roles, (dict, list)) else 0
    if count == 0:
        return CheckResult("model_registry", "fail", "0 roller — registry tomt")
    return CheckResult("model_registry", "ok", f"{count} roller")


def evaluate_ops_alerts(alerts: list[dict[str, Any]], now: datetime, recent_hours: int = 1) -> CheckResult:
    """Critical-larm yngre än `recent_hours` = fail. Äldre critical-larm = warn
    (de ska redan ha gett utslag tidigare, men låt inte ett gammalt öppet larm
    blockera varje ny deploy)."""
    cutoff = now - timedelta(hours=recent_hours)
    recent: list[dict[str, Any]] = []
    older: list[dict[str, Any]] = []
    for a in alerts:
        if (a.get("severity") or "").lower() != "critical":
            continue
        if a.get("status") and a["status"] != "open":
            continue
        ts = _parse_iso(a.get("first_seen") or a.get("last_seen") or a.get("created_at"))
        if ts is None:
            older.append(a)
        elif ts >= cutoff:
            recent.append(a)
        else:
            older.append(a)
    if recent:
        summary = ", ".join((a.get("kind") or "?") for a in recent[:5])
        return CheckResult("ops_alerts", "fail", f"{len(recent)} critical senaste {recent_hours}h: {summary}")
    if older:
        return CheckResult("ops_alerts", "warn", f"{len(older)} äldre öppna critical-larm — utred separat")
    return CheckResult("ops_alerts", "ok", "inga öppna critical-larm")


def aggregate(results: list[CheckResult]) -> int:
    """Returnerar 0 om alla ok/warn, 1 om någon failar."""
    return 1 if any(r.status == "fail" for r in results) else 0


def _parse_iso(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# --- Nätverkslager (httpx importeras lazy så enhetstester ej kräver det) ----


def _get_json(client: Any, path: str) -> tuple[dict[str, Any] | None, int]:
    import httpx

    try:
        r = client.get(path)
        if r.status_code >= 500:
            return None, r.status_code
        return (r.json() if r.content else None), r.status_code
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        return {"error": str(exc)}, 0


def _head_or_get(client: Any, url: str) -> int:
    import httpx

    try:
        r = client.get(url, follow_redirects=True)
        return r.status_code
    except httpx.HTTPError:
        return 0


def main() -> int:
    import httpx

    ap = argparse.ArgumentParser()
    ap.add_argument("--api-url", required=True)
    ap.add_argument("--frontend-url", default=os.environ.get("FRONTEND_URL", ""))
    ap.add_argument("--expected-sha", default=os.environ.get("COMMIT_SHA", ""))
    ap.add_argument("--admin-key", default=os.environ.get("ADMIN_API_KEY", ""))
    ap.add_argument("--since-hours", type=int, default=24, help="job_runs-fönster för failed-detektion")
    ap.add_argument("--ignore-jobs", default="", help="kommaseparerad lista över job_types att hoppa över")
    ap.add_argument("--timeout", type=float, default=15.0)
    args = ap.parse_args()

    api = httpx.Client(
        base_url=args.api_url.rstrip("/"),
        headers={"X-API-Key": args.admin_key} if args.admin_key else {},
        timeout=args.timeout,
    )
    now = datetime.now(timezone.utc)
    ignore_jobs = tuple(j.strip() for j in args.ignore_jobs.split(",") if j.strip())

    # 1. API /health
    health_payload, health_code = _get_json(api, "/health")
    results = [evaluate_api_health(health_payload, health_code, args.expected_sha or None)]

    # 2. Frontend
    fe_code = _head_or_get(httpx.Client(timeout=args.timeout), args.frontend_url) if args.frontend_url else 0
    results.append(evaluate_frontend_health(fe_code, args.frontend_url or None))

    # 3. Failed jobs
    runs_payload, _ = _get_json(api, f"/api/jobs/runs?limit=200")
    runs = (runs_payload or {}).get("runs") or []
    results.append(evaluate_job_runs(runs, now, args.since_hours, ignore_jobs))

    # 4. Scheduler-status
    sched_payload, _ = _get_json(api, "/api/schedules")
    results.append(evaluate_schedules(sched_payload or {}))

    # 5. Model-registry
    mr_payload, mr_code = _get_json(api, "/api/model-registry")
    results.append(evaluate_model_registry(mr_payload, mr_code))

    # 6. Ops alerts
    alerts_payload, _ = _get_json(api, "/api/ops/alerts?status=open&severity=critical")
    alerts = (alerts_payload or {}).get("alerts") or []
    results.append(evaluate_ops_alerts(alerts, now))

    print(f"== post-deploy-check @ {now.isoformat(timespec='seconds')} ==", flush=True)
    for r in results:
        marker = {"ok": "✓", "warn": "~", "fail": "✗"}.get(r.status, "?")
        print(f"  {marker} {r.name}: {r.detail}", flush=True)

    exit_code = aggregate(results)
    print(f"== exit {exit_code} ==", flush=True)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
