"""ESG & CSRD Perception Audit — API (riskloopens ESG-spår).

Knyter ihop den blinda ESG-skanningen (services/esg_scanner), AI ESG Risk Score
(services/esg_report) och ingestion-flödet "Borde svaret varit annorlunda?"
(services/esg_ingestion). Samma konventioner som routers/jobs.py + review.py + reports.py:
tunga körningar triggas in-process via BackgroundTasks; genererade frågor passerar en
review-grind innan de körs skarpt.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse
from google.cloud import firestore
from pydantic import BaseModel

import firestore_client as fs
from schemas import ESGMetricsSubmission

router = APIRouter(prefix="/api/esg", tags=["esg audit"])


def _require_client(client_id: str) -> None:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")


# --- Generering + skanning (triggers) -----------------------------------------


@router.post("/{client_id}/generate")
def trigger_generate(client_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """Seeda exempelfrågor + generera ESG-djupdykningar för review. Körs före scan."""
    _require_client(client_id)
    from services.esg_scanner import generate_and_store_esg_questions

    background.add_task(generate_and_store_esg_questions, client_id)
    return {"status": "queued", "job": "esg_generate", "client_id": client_id}


@router.post("/{client_id}/scan")
def trigger_scan(client_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """Blind ESG-nollmätning på de GODKÄNDA frågorna. No-op utan godkända frågor."""
    _require_client(client_id)
    from services.esg_scanner import run_esg_scan

    background.add_task(run_esg_scan, client_id)
    return {"status": "queued", "job": "esg_scan", "client_id": client_id}


@router.post("/{client_id}/report")
def trigger_report(client_id: str, background: BackgroundTasks, month: str | None = None) -> dict[str, Any]:
    """Bygg + persistera AI ESG Risk Score-rapporten (default innevarande månad)."""
    _require_client(client_id)
    from services import esg_report

    background.add_task(esg_report.run, client_id, month)
    return {"status": "queued", "job": "esg_report", "client_id": client_id, "month": month}


# --- Review-grind för genererade ESG-frågor -----------------------------------


@router.get("/{client_id}/questions")
def list_questions(client_id: str) -> dict[str, Any]:
    """Genererade ESG-frågor som väntar på godkännande. Endast godkända körs skarpt."""
    _require_client(client_id)
    items: list[dict[str, Any]] = []
    for qid, q in fs.iter_esg_questions(client_id):
        if q.get("status") not in (None, "open"):
            continue
        items.append(
            {
                "id": qid,
                "pillar": q.get("pillar"),
                "kind": q.get("kind"),
                "text": q.get("text"),
                "language": q.get("language"),
                "generated_at": _iso(q.get("generated_at")),
            }
        )
    items.sort(key=lambda x: (x.get("pillar") or "", x.get("kind") or ""))
    return {"client_id": client_id, "questions": items}


class ESGQuestionAction(BaseModel):
    decision: Literal["approve", "reject"]
    text: str | None = None  # valfri redigering av frågan före godkännande
    note: str | None = None


@router.post("/{client_id}/questions/{question_id}")
def decide_question(client_id: str, question_id: str, action: ESGQuestionAction) -> dict[str, Any]:
    """Godkänn/avvisa en genererad ESG-fråga. Endast godkända körs skarpt mot motorerna."""
    doc_ref = fs.esg_question_doc(client_id, question_id)
    if not doc_ref.get().exists:
        raise HTTPException(404, "esg question not found")
    update: dict[str, Any] = {
        "status": "approved" if action.decision == "approve" else "rejected",
        "needs_review": False,
        "review_note": action.note,
        "reviewed_at": firestore.SERVER_TIMESTAMP,
    }
    if action.text is not None:
        update["text"] = action.text
    doc_ref.update(update)
    return {"status": "ok", "decision": action.decision}


# --- Findings (blinda svar) + "Borde svaret varit annorlunda?" -----------------


@router.get("/{client_id}/findings")
def list_findings(client_id: str) -> dict[str, Any]:
    """Öppna ESG-findings med det blinda AI-svaret — underlag för 'Borde svaret varit
    annorlunda?'-knappen i frontend."""
    _require_client(client_id)
    items: list[dict[str, Any]] = []
    for fid, d in fs.iter_esg_findings(client_id):
        if d.get("review_status") not in (None, "open"):
            continue
        items.append(
            {
                "id": fid,
                "pillar": d.get("pillar"),
                "question": d.get("question"),
                "engine": d.get("engine"),
                "status": d.get("status"),
                "severity": d.get("severity"),
                "sentiment": d.get("sentiment"),
                "engine_excerpt": d.get("engine_excerpt"),
                "answer_excerpt": d.get("answer_excerpt"),
                "detected_at": _iso(d.get("detected_at")),
            }
        )
    order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: order.get(x.get("severity"), 3))
    return {"client_id": client_id, "findings": items}


@router.post("/{client_id}/submit-metrics")
def submit_metrics(client_id: str, submission: ESGMetricsSubmission) -> dict[str, Any]:
    """"Borde svaret varit annorlunda?" — validera ESRS-formuläret (3 faser) och omvandla
    till källförsedda korrigerande claims. FAS 1 obligatorisk; FAS 2/3 frivilliga."""
    _require_client(client_id)
    # Verifiera ev. finding-koppling.
    if submission.finding_id and not fs.esg_finding_doc(client_id, submission.finding_id).get().exists:
        raise HTTPException(404, "esg finding not found")

    from services import esg_ingestion

    result = esg_ingestion.ingest_submission(client_id, submission)
    return {"status": "ok", **result}


# --- Rapport (AI ESG Risk Score, läs-vy) --------------------------------------


@router.get("/{client_id}/report/{month}")
def get_report(client_id: str, month: str) -> dict[str, Any]:
    report = _load_report(client_id, month)
    report["generated_at"] = _iso(report.get("generated_at"))
    return report


@router.get("/{client_id}/report/{month}/html", response_class=HTMLResponse)
def get_report_html(client_id: str, month: str) -> HTMLResponse:
    from services.esg_report import render_report_html

    return HTMLResponse(render_report_html(_load_report(client_id, month)))


def _load_report(client_id: str, month: str) -> dict[str, Any]:
    snap = fs.esg_report_doc(client_id, month).get()
    if not snap.exists:
        raise HTTPException(404, f"esg report not found: {client_id}/{month}")
    return snap.to_dict() or {}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)
