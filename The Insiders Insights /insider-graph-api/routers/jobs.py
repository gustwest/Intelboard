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

import firestore_client as fs
from jobs import compile_schema, polling_weekly, quarterly_todo, scrape_active, scrape_episodic, sunset_skills, xml_sync

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

EVENTARC_DOC_RE = re.compile(r"clients/([^/]+)/")


@router.post("/scrape-active")
def trigger_scrape_active(background: BackgroundTasks) -> dict[str, Any]:
    background.add_task(scrape_active.run)
    return {"status": "queued", "job": "scrape_active"}


@router.post("/scrape-episodic")
def trigger_scrape_episodic(background: BackgroundTasks) -> dict[str, Any]:
    background.add_task(scrape_episodic.run)
    return {"status": "queued", "job": "scrape_episodic"}


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
    from services.claim_extraction import extract_claims_for_client

    background.add_task(extract_claims_for_client, client_id)
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

    background.add_task(generate_and_store_questions, client_id)
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

    background.add_task(run_for_client, client_id)
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
