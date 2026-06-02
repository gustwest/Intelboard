"""Manuella triggers för cron-jobben.

Cloud Scheduler kör dem periodiskt, men för pilot-test vill man kunna köra
en runda direkt från admin-UI. Endpoints kör jobben in-process på Cloud
Run-tjänsten — duger för MVP-scale (en kund åt gången, fåtal medarbetare).

För tunga körningar (många kunder/medarbetare) bör motsvarande Cloud Run Job
istället triggas via `gcloud run jobs execute`.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from google.cloud import firestore

import firestore_client as fs
from jobs import compile_schema, extract_claims, polling_weekly, quarterly_todo, scrape_active, sunset_skills, xml_sync
from jobs._run_tracker import record_run, tracked

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

EVENTARC_DOC_RE = re.compile(r"clients/([^/]+)/")


@router.get("/runs")
def list_job_runs(
    client_id: str | None = None, job_type: str | None = None, limit: int = 50
) -> dict[str, Any]:
    """Körningshistorik, senaste först. Filtrera valfritt på kund och/eller jobbtyp.

    Hämtar ett tak av de senaste körningarna och filtrerar i Python → inga
    composite-index krävs.
    """
    limit = max(1, min(limit, 200))
    query = fs.job_runs_col().order_by("started_at", direction=firestore.Query.DESCENDING).limit(500)
    runs: list[dict[str, Any]] = []
    for snap in query.stream():
        d = snap.to_dict() or {}
        if client_id is not None and d.get("client_id") != client_id:
            continue
        if job_type is not None and d.get("job_type") != job_type:
            continue
        runs.append(
            {
                "id": snap.id,
                "job_type": d.get("job_type"),
                "client_id": d.get("client_id"),
                "status": d.get("status"),
                "started_at": _iso(d.get("started_at")),
                "ended_at": _iso(d.get("ended_at")),
                "duration_seconds": d.get("duration_seconds"),
                "summary": d.get("summary") or {},
                "error_message": d.get("error_message"),
            }
        )
        if len(runs) >= limit:
            break
    return {"runs": runs}


# Nyckeljobben som avgör om en kunds data faktiskt bearbetas (kund-tidslinjens ryggrad).
HEALTH_JOBS = ("scrape_active", "extract_claims", "compile_schema", "compute_trust_gap")
# Pipelinen kör veckovis (website) → dagligen; äldre än så = något har stannat.
STALE_DAYS = 8


@router.get("/health")
def client_health() -> dict[str, Any]:
    """Tvärgående kundhälsa: för varje kund den senaste lyckade körningen per nyckeljobb,
    plus en färskhetsflagga. Svaret på 'har den här kundens data bearbetats?' — sämst först.

    Skannar ett tak av de senaste körningarna och aggregerar i Python (inga composite-index).
    Aggregeringen ligger i build_health() (ren → enhetstestbar utan Firestore).
    """
    from datetime import datetime, timezone

    query = fs.job_runs_col().order_by("started_at", direction=firestore.Query.DESCENDING).limit(3000)
    runs = [
        {"client_id": (d := snap.to_dict() or {}).get("client_id"),
         "job_type": d.get("job_type"), "status": d.get("status"),
         "started_at": _iso(d.get("started_at"))}
        for snap in query.stream()
    ]
    return build_health(runs, list(fs.iter_clients()), datetime.now(timezone.utc))


def build_health(runs: list[dict[str, Any]], clients: list[Any], now: Any) -> dict[str, Any]:
    """Ren aggregering: senaste lyckade körning per (kund, nyckeljobb) + färskhetsflagga.
    `runs` förväntas i fallande tidsordning (senaste först). `clients` = (id, dict)-par."""
    from datetime import timezone

    last_ok: dict[str, dict[str, str]] = {}
    for r in runs:
        cid, jt = r.get("client_id"), r.get("job_type")
        if not cid or jt not in HEALTH_JOBS or r.get("status") != "success":
            continue
        per = last_ok.setdefault(cid, {})
        if jt not in per and r.get("started_at"):  # första (= senaste) träffen vinner
            per[jt] = r["started_at"]

    def _age_days(iso: str | None) -> float | None:
        if not iso:
            return None
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (now - dt).total_seconds() / 86400

    rows: list[dict[str, Any]] = []
    for client_id, client in clients:
        jobs_seen = last_ok.get(client_id, {})
        per_job = {jt: {"at": jobs_seen.get(jt), "age_days": _age_days(jobs_seen.get(jt))} for jt in HEALTH_JOBS}
        ages = [v["age_days"] for v in per_job.values() if v["age_days"] is not None]
        missing = [jt for jt in HEALTH_JOBS if not per_job[jt]["at"]]
        worst_age = max(ages) if ages else None
        stale = bool(missing) or (worst_age is not None and worst_age > STALE_DAYS)
        rows.append({
            "client_id": client_id,
            "company_name": (client or {}).get("company_name") or client_id,
            "jobs": per_job,
            "missing": missing,
            "worst_age_days": round(worst_age, 1) if worst_age is not None else None,
            "stale": stale,
            "never_processed": len(missing) == len(HEALTH_JOBS),
        })

    # Sämst hälsa först: aldrig bearbetade, sedan stale, sedan äldst.
    rows.sort(key=lambda r: (not r["never_processed"], not r["stale"], -(r["worst_age_days"] or 0)))
    return {"key_jobs": list(HEALTH_JOBS), "stale_days": STALE_DAYS, "clients": rows}


@router.post("/scrape-active")
def trigger_scrape_active(background: BackgroundTasks) -> dict[str, Any]:
    background.add_task(scrape_active.run)
    return {"status": "queued", "job": "scrape_active"}


@router.post("/polling")
def trigger_polling(background: BackgroundTasks) -> dict[str, Any]:
    background.add_task(polling_weekly.run)
    return {"status": "queued", "job": "polling_weekly"}


@router.post("/xml-sync")
def trigger_xml_sync(background: BackgroundTasks) -> dict[str, Any]:
    """Jobfeed: hämta ATS-annonser + diffa stängda jobb (spec §1.2)."""
    background.add_task(xml_sync.run)
    return {"status": "queued", "job": "xml_sync"}


@router.post("/sunset-skills")
def trigger_sunset_skills(background: BackgroundTasks) -> dict[str, Any]:
    """Hard-deleta stängda annons-noder äldre än 24 mån (spec §3.3)."""
    background.add_task(sunset_skills.run)
    return {"status": "queued", "job": "sunset_skills"}


@router.post("/quarterly-todo")
def trigger_quarterly_todo(background: BackgroundTasks) -> dict[str, Any]:
    """Skapa kvartals-LinkedIn-To-Dos för kunder som inte laddat upp på ~90 dagar (spec §4.1)."""
    background.add_task(quarterly_todo.run)
    return {"status": "queued", "job": "quarterly_todo"}


@router.post("/extract-claims/{client_id}")
def trigger_extract_claims(client_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """Narrativ claims-extraktion för en kund (fritext → narrative-claims). Kör compile
    efteråt för att projicera de nya claimsen in i JSON-LD/profilsidan."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, "client not found")
    # Via jobb-wrappern (inte servicen direkt) så körningen hamnar i job_runs.
    background.add_task(extract_claims.run, client_id)
    return {"status": "queued", "job": "extract_claims", "client_id": client_id}


@router.post("/compile/{client_id}")
def trigger_compile(client_id: str, background: BackgroundTasks) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, "client not found")
    background.add_task(compile_schema.run, client_id)
    return {"status": "queued", "job": "compile_schema", "client_id": client_id}


@router.post("/risk-generate/{client_id}")
def trigger_risk_generate(client_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """GEO-riskloop — generera (+cacha) frågebatteriet för review. Körs före risk-detect."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, "client not found")
    from services.risk_detector import generate_and_store_questions

    background.add_task(tracked, "risk_generate", client_id, generate_and_store_questions, client_id)
    return {"status": "queued", "job": "risk_generate", "client_id": client_id}


@router.post("/risk-detect/{client_id}")
def trigger_risk_detect(client_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """GEO-riskloop skiva 1 — klassa motorsvar på de GODKÄNDA frågorna för en kund.

    Kräver att frågor genererats (risk-generate) och godkänts i review. Utan godkända
    frågor blir det en no-op.
    """
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, "client not found")
    from services.risk_detector import run_for_client

    background.add_task(tracked, "risk_detect", client_id, run_for_client, client_id)
    return {"status": "queued", "job": "risk_detect", "client_id": client_id}


@router.post("/monthly-report/{client_id}")
def trigger_monthly_report(client_id: str, background: BackgroundTasks, month: str | None = None) -> dict[str, Any]:
    """GEO-riskloop skiva 3 — bygg + persistera månadsrapporten (default innevarande månad)."""
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, "client not found")
    from jobs import monthly_report

    background.add_task(monthly_report.run, client_id, month)
    return {"status": "queued", "job": "monthly_report", "client_id": client_id, "month": month}


@router.post("/esg-monthly")
def trigger_esg_monthly(background: BackgroundTasks) -> dict[str, Any]:
    """Riskloopens ESG-spår — månatlig fan-out: kör blind skanning + rapport för ALLA
    kunder med ESG-tillägget påslaget. Skanning körs på redan GODKÄNDA frågor (generering
    + review är manuellt/separat, som GEO-riskloopens generate vs detect)."""
    background.add_task(_run_esg_monthly)
    return {"status": "queued", "job": "esg_monthly"}


def _run_esg_monthly() -> None:
    from services import esg_report
    from services.esg_scanner import run_esg_scan

    ran = 0
    for cid, data in fs.iter_clients():
        if not data.get("esg_audit_enabled"):
            continue
        try:
            with record_run("esg_scan", cid):
                run_esg_scan(cid)
                esg_report.run(cid)
            ran += 1
        except Exception as exc:  # en kund får inte fälla hela fan-outen
            log.warning("esg_monthly: kund %s misslyckades: %s", cid, exc)
    log.info("esg_monthly: körde %d kund(er) med ESG-tillägg", ran)


@router.post("/compile-via-eventarc")
async def compile_via_eventarc(request: Request, background: BackgroundTasks) -> dict[str, Any]:
    """Eventarc-target: triggas av Firestore-writes på raw_items/.

    Extraherar client_id från CloudEvent-headern `ce-subject` eller body-fältet
    `value.name`, t.ex. `documents/clients/<cid>/employees/<eid>/raw_items/<id>`.
    """
    subject = request.headers.get("ce-subject", "")
    client_id = _parse_client(subject)
    if not client_id:
        body = await request.json()
        client_id = _parse_client(_eventarc_doc_name(body))
    if not client_id:
        log.warning("eventarc: kunde inte tolka client_id; headers=%s", dict(request.headers))
        return {"status": "ignored", "reason": "no client_id"}

    background.add_task(compile_schema.run, client_id)
    return {"status": "queued", "client_id": client_id}


def _parse_client(text: str | None) -> str | None:
    if not text:
        return None
    m = EVENTARC_DOC_RE.search(text)
    return m.group(1) if m else None


def _eventarc_doc_name(body: Any) -> str:
    if not isinstance(body, dict):
        return ""
    value = body.get("value") or {}
    return value.get("name", "") if isinstance(value, dict) else ""


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
