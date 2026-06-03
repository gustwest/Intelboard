"""Critical-chain smoke — driver en TESTKUND genom hela kedjan end-to-end.

Verifierar att leveranskedjan håller:
  scrape-website → extract-claims → compile-schema → CDN-leverans →
  trust-gap (humanization) → verification → polling → risk-loop

Tänkt användning:
  - Manuellt innan en större merge (typ ny connector).
  - Innan output-quality check-in 2026-06-13 så baseline-jämförelsen står på
    fungerande infra.
  - NOT (än) schemalagd nattligen — lägg till när skriptet bevisat sig stabilt
    och vi vill ha den signalen kontinuerligt.

Skiver: A1/A3/A4 skapar nya `job_runs`-rader för testkunden (TTL städar dem).
Steg D (risk-loop) körs med --dry-run så inga skarpa action-statements skapas.

Exit-policy:
  - A-steg eller D-steg failar  → exit 1 (rött)
  - B/C tomma (rapport/polling saknas) → exit 0 men WARN i utskriften, eftersom
    veckokörningen kan legitimt vara tom på en ny testkund.

Exempel:
  python scripts/critical_chain_smoke.py \\
      --base-url https://insider-graph-api-xxx.run.app \\
      --client-id geogiraph-smoke \\
      --skip-risk-loop   # om Vertex EU har lågflyg
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class Step:
    name: str
    status: str  # "ok" | "warn" | "fail" | "skip"
    detail: str = ""


# --- Helpers ----------------------------------------------------------------


def _post(c, path: str, json: dict | None = None, params: dict | None = None) -> dict:
    r = c.post(path, json=json, params=params)
    r.raise_for_status()
    return r.json() if r.content else {}


def _get(c, path: str) -> dict:
    r = c.get(path)
    r.raise_for_status()
    return r.json()


def _wait_for_run(c, client_id: str, job_type: str, since: datetime, timeout: int) -> dict | None:
    """Polla /api/jobs/runs tills en run för (client, job_type) startad efter `since`
    har nått terminal-status (success eller failed). Returnerar run-doc eller None
    vid timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        runs = _get(c, f"/api/jobs/runs?client_id={client_id}&job_type={job_type}&limit=20").get("runs") or []
        for r in runs:
            started = _parse_iso(r.get("started_at"))
            if started and started >= since and r.get("status") in ("success", "failed"):
                return r
        time.sleep(5)
    return None


def _parse_iso(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _step(steps: list[Step], step: Step) -> Step:
    marker = {"ok": "✓", "warn": "~", "fail": "✗", "skip": "·"}.get(step.status, "?")
    print(f"  {marker} {step.name}: {step.detail}", flush=True)
    steps.append(step)
    return step


# --- Steg -------------------------------------------------------------------


def step_scrape(c, cid: str, since: datetime, timeout: int) -> Step:
    try:
        _post(c, f"/api/jobs/scrape-active")
    except Exception as exc:
        return Step("A1 scrape", "fail", f"trigger failed: {exc}")
    run = _wait_for_run(c, cid, "scrape_active", since, timeout)
    if not run:
        return Step("A1 scrape", "fail", f"ingen körning inom {timeout}s")
    if run.get("status") != "success":
        return Step("A1 scrape", "fail", f"status={run.get('status')} err={run.get('error_message')}")
    return Step("A1 scrape", "ok", f"run={run.get('id')}")


def step_extract_claims(c, cid: str, since: datetime, timeout: int) -> Step:
    try:
        _post(c, f"/api/jobs/extract-claims/{cid}")
    except Exception as exc:
        return Step("A2 extract-claims", "fail", f"trigger failed: {exc}")
    run = _wait_for_run(c, cid, "extract_claims", since, timeout)
    if not run:
        return Step("A2 extract-claims", "fail", f"ingen körning inom {timeout}s")
    if run.get("status") != "success":
        return Step("A2 extract-claims", "fail", f"status={run.get('status')} err={run.get('error_message')}")
    n = (run.get("summary") or {}).get("claims_count") or (run.get("summary") or {}).get("claims") or 0
    return Step("A2 extract-claims", "ok", f"claims={n}")


def step_compile(c, cid: str, since: datetime, timeout: int) -> Step:
    try:
        _post(c, f"/api/jobs/compile/{cid}")
    except Exception as exc:
        return Step("A3 compile", "fail", f"trigger failed: {exc}")
    run = _wait_for_run(c, cid, "compile_schema", since, timeout)
    if not run:
        return Step("A3 compile", "fail", f"ingen körning inom {timeout}s")
    if run.get("status") != "success":
        return Step("A3 compile", "fail", f"status={run.get('status')} err={run.get('error_message')}")
    return Step("A3 compile", "ok", f"run={run.get('id')}")


def step_pipeline_status(c, cid: str) -> Step:
    """Verifiera att kundens pipeline-status reflekterar bearbetningen."""
    try:
        payload = _get(c, f"/api/clients/{cid}/pipeline")
    except Exception as exc:
        return Step("A4 pipeline", "fail", f"GET failed: {exc}")
    stages = payload.get("stages") or []
    if not stages:
        return Step("A4 pipeline", "warn", "tomt stages-svar")
    bad = [s.get("key") for s in stages if s.get("status") == "error"]
    if bad:
        return Step("A4 pipeline", "fail", f"steg i error: {bad}")
    return Step("A4 pipeline", "ok", f"{len(stages)} steg")


def step_humanization(c, cid: str) -> Step:
    try:
        payload = _get(c, f"/api/reports/{cid}/humanization")
    except Exception as exc:
        return Step("B1 humanization", "warn", f"GET failed: {exc}")
    if not isinstance(payload, dict) or not payload:
        return Step("B1 humanization", "warn", "tomt svar — trust_gap_report kanske ej körd än")
    keys = {"declared", "demonstrated", "perceived"}
    if not keys.intersection(payload.keys()) and not keys.intersection((payload.get("dimensions") or {}).keys()):
        return Step("B1 humanization", "warn", "saknar declared/demonstrated/perceived-fält")
    return Step("B1 humanization", "ok", "trust-gap payload OK")


def step_verification(c, cid: str) -> Step:
    try:
        payload = _get(c, f"/api/verification/{cid}")
    except Exception as exc:
        return Step("B2 verification", "warn", f"GET failed: {exc}")
    if not isinstance(payload, dict):
        return Step("B2 verification", "warn", "ej dict-svar")
    return Step("B2 verification", "ok", "200")


def step_polling(c, cid: str) -> Step:
    try:
        payload = _get(c, f"/api/polling/{cid}")
    except Exception as exc:
        return Step("C1 polling", "warn", f"GET failed: {exc}")
    weeks = payload.get("weeks") or payload.get("weekly") or []
    if not weeks:
        return Step("C1 polling", "warn", "inga veckor — polling-weekly ej körd än")
    last = weeks[0] if isinstance(weeks, list) else None
    per_engine = (last or {}).get("per_engine") if isinstance(last, dict) else None
    if not per_engine:
        return Step("C1 polling", "warn", f"{len(weeks)} veckor men per_engine saknas")
    return Step("C1 polling", "ok", f"{len(weeks)} veckor, per_engine OK")


def step_risk_loop(c_base_url: str, admin_key: str, cid: str, timeout: int) -> Step:
    """Wrappa risk_loop_smoke.py med --dry-run så inga skarpa claims skapas."""
    script = Path(__file__).parent / "risk_loop_smoke.py"
    cmd = [
        sys.executable, str(script),
        "--base-url", c_base_url,
        "--client-id", cid,
        "--auto-approve", "--dry-run",
        "--timeout", str(timeout),
    ]
    env = os.environ.copy()
    if admin_key:
        env["ADMIN_API_KEY"] = admin_key
    try:
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=timeout * 6)
    except subprocess.TimeoutExpired:
        return Step("D risk-loop", "fail", f"timeout efter {timeout * 6}s")
    if proc.returncode != 0:
        tail = (proc.stdout + proc.stderr).strip().splitlines()[-3:]
        return Step("D risk-loop", "fail", f"exit {proc.returncode}: {' | '.join(tail)}")
    return Step("D risk-loop", "ok", "exit 0")


def step_model_drift(c) -> Step:
    try:
        payload = _get(c, "/api/model-drift")
    except Exception as exc:
        return Step("E model-drift", "warn", f"GET failed: {exc}")
    findings = payload.get("findings") or []
    unauthorized = [f for f in findings if (f.get("kind") or "") == "unauthorized_hardcode"]
    if unauthorized:
        return Step("E model-drift", "fail", f"{len(unauthorized)} unauthorized_hardcode")
    return Step("E model-drift", "ok", f"{len(findings)} findings (alla godartade)")


# --- Main -------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--client-id", required=True, help="dedikerad testkund (t.ex. geogiraph-smoke)")
    ap.add_argument("--admin-key", default=os.environ.get("ADMIN_API_KEY", ""))
    ap.add_argument("--timeout", type=int, default=600, help="max sekunder per jobb-steg")
    ap.add_argument("--skip-risk-loop", action="store_true",
                    help="hoppa över risk-loop-steget (om Vertex EU har lågflyg)")
    args = ap.parse_args()

    try:
        import httpx
    except ImportError:
        print("httpx krävs — pip install httpx", file=sys.stderr)
        return 2

    c = httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers={"X-API-Key": args.admin_key} if args.admin_key else {},
        timeout=30,
    )
    cid = args.client_id
    started_at = datetime.now(timezone.utc)
    steps: list[Step] = []

    print(f"== critical-chain-smoke @ {started_at.isoformat(timespec='seconds')} — kund={cid} ==", flush=True)

    # A: leveranskedjan
    print("\n-- A: scrape → claims → compile → pipeline --", flush=True)
    a1 = _step(steps, step_scrape(c, cid, started_at, args.timeout))
    if a1.status == "ok":
        a2 = _step(steps, step_extract_claims(c, cid, started_at, args.timeout))
        if a2.status == "ok":
            _step(steps, step_compile(c, cid, started_at, args.timeout))
    _step(steps, step_pipeline_status(c, cid))

    # B: leverans-konsumenter
    print("\n-- B: humanization / verification --", flush=True)
    _step(steps, step_humanization(c, cid))
    _step(steps, step_verification(c, cid))

    # C: polling-data
    print("\n-- C: polling --", flush=True)
    _step(steps, step_polling(c, cid))

    # D: risk-loop
    print("\n-- D: risk-loop (dry-run) --", flush=True)
    if args.skip_risk_loop:
        _step(steps, Step("D risk-loop", "skip", "--skip-risk-loop"))
    else:
        _step(steps, step_risk_loop(args.base_url, args.admin_key, cid, args.timeout))

    # E: model-drift
    print("\n-- E: model-drift --", flush=True)
    _step(steps, step_model_drift(c))

    # Aggregera
    fails = [s for s in steps if s.status == "fail"]
    warns = [s for s in steps if s.status == "warn"]
    print(f"\n== summary: {len(steps)} steg, {len(fails)} FAIL, {len(warns)} WARN ==", flush=True)
    if fails:
        print(f"== exit 1 ==", flush=True)
        return 1
    print(f"== exit 0 ==", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
