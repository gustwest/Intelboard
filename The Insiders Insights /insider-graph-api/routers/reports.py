"""GEO-riskloopens månadsrapport — läs-endpoints (skiva 3).

Rapporten landar fysiskt i clients/{cid}/monthly_reports/{YYYY-MM} (byggs av
jobs/monthly_report.py). Här exponeras den för påsyn: lista, JSON-vy och en
renderad HTML-vy (render-modell-mönstret från profile_page).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

import firestore_client as fs
from services.monthly_report import render_report_html

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{client_id}")
def list_reports(client_id: str) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    months = sorted(
        (mid for mid, _ in fs.iter_monthly_reports(client_id)), reverse=True
    )
    return {"client_id": client_id, "months": months}


@router.get("/{client_id}/{month}")
def get_report(client_id: str, month: str) -> dict[str, Any]:
    report = _load(client_id, month)
    report["generated_at"] = _iso(report.get("generated_at"))
    return report


@router.get("/{client_id}/{month}/html", response_class=HTMLResponse)
def get_report_html(client_id: str, month: str) -> HTMLResponse:
    return HTMLResponse(render_report_html(_load(client_id, month)))


def _load(client_id: str, month: str) -> dict[str, Any]:
    snap = fs.monthly_report_doc(client_id, month).get()
    if not snap.exists:
        raise HTTPException(404, f"report not found: {client_id}/{month}")
    return snap.to_dict() or {}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)
