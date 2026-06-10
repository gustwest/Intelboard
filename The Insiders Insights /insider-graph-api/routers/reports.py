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
from services import contacts, notifications, trust_gap_report
from services.monthly_report import render_customer_email, render_report_html

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{client_id}")
def list_reports(client_id: str) -> dict[str, Any]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    months = sorted(
        (mid for mid, _ in fs.iter_monthly_reports(client_id)), reverse=True
    )
    return {"client_id": client_id, "months": months}


@router.get("/{client_id}/humanization")
def get_humanization(client_id: str) -> dict[str, Any]:
    """Den begripliga Humaniseringstäckning-modellen (översättningslagret §10.1) för
    AI-synlighet-fliken. available=False om trust_gap ännu inte beräknats för kunden.

    Deklareras FÖRE /{client_id}/{month} så att 'humanization' inte tolkas som en månad.
    """
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    model = trust_gap_report.build_report_model(client_id)
    if model is None:
        return {"available": False, "client_id": client_id}
    return {"available": True, **model}


@router.get("/{client_id}/{month}")
def get_report(client_id: str, month: str) -> dict[str, Any]:
    report = _load(client_id, month)
    report["generated_at"] = _iso(report.get("generated_at"))
    return report


@router.get("/{client_id}/{month}/html", response_class=HTMLResponse)
def get_report_html(client_id: str, month: str) -> HTMLResponse:
    return HTMLResponse(render_report_html(_load(client_id, month)))


@router.post("/{client_id}/{month}/send-customer-email")
def send_customer_report(client_id: str, month: str) -> dict[str, Any]:
    """Mejla en kund-säker månadssammanfattning till kundkontakten (B2). Self-no-op
    om kontakt/Brevo saknas. Endast ofarliga fält (beslutssäkerhet/trend/styrkor/
    förbättringar) — aldrig motor-citat, harm-koder eller det interna utkastet."""
    report = _load(client_id, month)
    data = fs.client_doc(client_id).get().to_dict() or {}
    subject, html_body, text_body = render_customer_email(
        report, lang=data.get("language"), contact_name=data.get("contact_name"),
    )
    result = notifications.send_customer_email(
        contacts.primary_email(data), subject, html_body, text_body,
        cc=contacts.secondary_emails(data),  # N2: cc sekundärkontakter
    )
    return {"client_id": client_id, "month": month, **result}


def _load(client_id: str, month: str) -> dict[str, Any]:
    snap = fs.monthly_report_doc(client_id, month).get()
    if not snap.exists:
        raise HTTPException(404, f"report not found: {client_id}/{month}")
    return snap.to_dict() or {}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)
