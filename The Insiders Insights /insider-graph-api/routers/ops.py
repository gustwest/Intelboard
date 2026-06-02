"""Ops-alerts API — drift-notiser i systemets inbox.

GET  /api/ops/alerts                       → lista (filtrerbar på status/severity)
POST /api/ops/alerts/{alert_id}/ack        → markera "sedd", inboxen visar fortfarande
POST /api/ops/alerts/{alert_id}/resolve    → manuellt stäng

Webhook-vägen ligger separat i routers/webhooks.py (publik prefix utan API-key,
verifieras via query-token) så Cloud Pub/Sub push kan POST:a budget-alerts hit.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

import firestore_client as fs
from config import settings
from services import ops_alerts

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ops", tags=["ops"])

_SEVERITY_ORDER = {
    ops_alerts.SEVERITY_CRITICAL: 0,
    ops_alerts.SEVERITY_WARNING: 1,
    ops_alerts.SEVERITY_INFO: 2,
}


@router.get("/alerts")
def list_alerts(
    status: str = Query("open", description="open|resolved|all"),
    severity: str | None = Query(None, description="info|warning|critical, default alla"),
) -> dict[str, Any]:
    """Lista alerts. Default = öppna, sorterade efter severity (critical först)
    och senast sedda (nyast först)."""
    alerts: list[dict[str, Any]] = []
    try:
        for aid, doc in fs.iter_ops_alerts():
            if status != "all" and doc.get("status") != status:
                continue
            if severity and doc.get("severity") != severity:
                continue
            alerts.append({
                "id": aid,
                "kind": doc.get("kind"),
                "source": doc.get("source"),
                "title": doc.get("title"),
                "detail": doc.get("detail"),
                "severity": doc.get("severity"),
                "status": doc.get("status"),
                "client_id": doc.get("client_id"),
                "occurrence_count": doc.get("occurrence_count", 1),
                "reopen_count": doc.get("reopen_count", 0),
                "first_seen_at": _iso(doc.get("first_seen_at")),
                "last_seen_at": _iso(doc.get("last_seen_at")),
                "last_message": doc.get("last_message"),
                "ack_by": doc.get("ack_by"),
                "ack_at": _iso(doc.get("ack_at")),
                "resolved_at": _iso(doc.get("resolved_at")),
                "resolved_by": doc.get("resolved_by"),
            })
    except Exception as exc:  # noqa: BLE001 — UI:t klarar tomt svar
        log.warning("ops alerts list failed: %s", exc)

    alerts.sort(key=lambda a: (
        _SEVERITY_ORDER.get(a["severity"], 99),
        # Negera senast sedd för descending — None hamnar sist
        -(a["last_seen_at"] or "").__hash__() if a["last_seen_at"] else 0,
    ))
    return {
        "alerts": alerts,
        "total": len(alerts),
        "open_count": sum(1 for a in alerts if a["status"] == "open"),
    }


@router.post("/alerts/{alert_id}/ack")
def ack_alert(alert_id: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Markera alert som sedd. Stannar i inboxen tills resolve."""
    ack_by = (body or {}).get("by") or "anonymous"
    ok = ops_alerts.ack(alert_id_value=alert_id, ack_by=ack_by)
    if not ok:
        raise HTTPException(500, "ack failed (se logs)")
    return {"status": "acked", "alert_id": alert_id}


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Stäng manuellt. Försvinner ur inboxen; återkommande problem re-öppnar samma doc."""
    resolved_by = (body or {}).get("by") or "manual"
    ok = ops_alerts.resolve(alert_id_value=alert_id, resolved_by=resolved_by)
    if not ok:
        raise HTTPException(500, "resolve failed (se logs)")
    return {"status": "resolved", "alert_id": alert_id}


# --- Setup-status (manuella konfigurations-kvitteringar) --------------------
# Två "manuella" steg finns runt ops-alerts: 1) OPS_WEBHOOK_TOKEN måste vara
# satt på Cloud Run-tjänsten, 2) Cloud Billing-budgeten måste konfigureras
# att publicera till Pub/Sub-topicen. Steg 1 kan vi detektera (env-var satt
# eller ej); steg 2 är en konsol-klickning utanför vår räckvidd, så ops får
# kvittera "jag har gjort det" via UI:t. Statusen visas som banner på alerts-
# sidan tills båda är gröna.


@router.get("/setup-status")
def get_setup_status() -> dict[str, Any]:
    """Returnerar systemets uppfattning om setup-stegen för ops-alerts."""
    state: dict[str, Any] = {}
    try:
        snap = fs.ops_setup_doc().get()
        if snap.exists:
            state = snap.to_dict() or {}
    except Exception as exc:  # noqa: BLE001
        log.warning("ops setup-status read failed: %s", exc)
    return {
        "webhook_token_configured": bool(settings.ops_webhook_token),
        "budget_source_acked": bool(state.get("budget_source_acked")),
        "budget_source_acked_at": _iso(state.get("budget_source_acked_at")),
        "budget_source_acked_by": state.get("budget_source_acked_by"),
    }


@router.post("/setup-status/ack-budget-source")
def ack_budget_source(body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Kvittera att Cloud Billing-budgeten har kopplats till Pub/Sub-topicen.
    Idempotent — kan kallas flera gånger; senaste värdet vinner."""
    by = (body or {}).get("by") or "ops"
    from google.cloud import firestore as gcf

    try:
        fs.ops_setup_doc().set(
            {
                "budget_source_acked": True,
                "budget_source_acked_at": gcf.SERVER_TIMESTAMP,
                "budget_source_acked_by": by,
            },
            merge=True,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("ops setup-status write failed: %s", exc)
        raise HTTPException(500, "kunde inte spara setup-status")
    return {"status": "acked", "by": by}


@router.post("/setup-status/unack-budget-source")
def unack_budget_source() -> dict[str, Any]:
    """Återställ kvitteringen — vid t.ex. byte av billing-konto, eller om vi
    upptäcker att kopplingen inte längre fungerar."""
    from google.cloud import firestore as gcf

    try:
        fs.ops_setup_doc().set(
            {"budget_source_acked": False, "budget_source_unacked_at": gcf.SERVER_TIMESTAMP},
            merge=True,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("ops setup-status unack failed: %s", exc)
        raise HTTPException(500, "kunde inte uppdatera setup-status")
    return {"status": "unacked"}


# --- Webhook-yta (utanför /api/ops/*-prefixet pga auth-skillnad) -------------
# Cloud Pub/Sub push-subscriptions kan inte sätta godtyckliga headers, så vi
# verifierar via query-param ?token=... mot OPS_WEBHOOK_TOKEN. Skapas separat
# under PUBLIC_PREFIXES i auth.py så API-key-middleware släpper igenom dem.

webhook_router = APIRouter(prefix="/api/webhooks", tags=["ops-webhooks"])


@webhook_router.post("/ops-alerts")
async def ops_alerts_webhook(request: Request, token: str = Query("")) -> dict[str, Any]:
    """Pub/Sub push-endpoint. Översätter Cloud Billing budget-payloads (och valfri
    generisk JSON) till ops_alerts.raise_alert(). Returnerar alltid 200 vid auth-OK
    så Pub/Sub inte retryar i evighet på en transient parse-bugg — felet loggas i
    stället."""
    if not settings.ops_webhook_token or token != settings.ops_webhook_token:
        raise HTTPException(401, "invalid webhook token")

    try:
        envelope = await request.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "invalid json")

    data = _extract_pubsub_data(envelope)
    if data is None:
        log.warning("ops-alerts webhook: kunde inte parsa payload: %s", envelope)
        return {"status": "ignored", "reason": "unparseable"}

    aid = _route_payload(data)
    return {"status": "ok", "alert_id": aid}


def _extract_pubsub_data(envelope: dict[str, Any]) -> dict[str, Any] | None:
    """Pub/Sub push: {message: {data: base64}}. Fall back till hela envelope om
    påkopplaren skickar JSON direkt (testverktyg, manuella curl-anrop)."""
    msg = envelope.get("message")
    if isinstance(msg, dict):
        raw = msg.get("data")
        if isinstance(raw, str):
            try:
                decoded = base64.b64decode(raw).decode("utf-8")
                return json.loads(decoded)
            except Exception:  # noqa: BLE001
                return None
    if "kind" in envelope or "budgetDisplayName" in envelope:
        return envelope
    return None


def _route_payload(data: dict[str, Any]) -> str | None:
    """Mappa kända payload-former till raise_alert. Två rutter:
    - Cloud Billing budget (`budgetDisplayName` + `alertThresholdExceeded`)
    - Generic ops-event (`kind` + `source`)
    """
    if "budgetDisplayName" in data:
        return _route_billing(data)
    if "kind" in data:
        return _route_generic(data)
    log.warning("ops-alerts webhook: okänd payload-form: %s", list(data.keys()))
    return None


def _route_billing(data: dict[str, Any]) -> str | None:
    name = data.get("budgetDisplayName") or "default"
    threshold = float(data.get("alertThresholdExceeded") or 0)
    cost = data.get("costAmount")
    budget_amount = data.get("budgetAmount")
    currency = data.get("currencyCode") or ""
    # Forecasted-larm (alertThresholdExceeded > 1.0 betyder prognos överstiger budget).
    forecast = data.get("forecastThresholdExceeded")
    if forecast:
        title = f"Budget {name}: prognos {int(float(forecast) * 100)}% av tak"
        severity = ops_alerts.SEVERITY_CRITICAL
    elif threshold >= 1.0:
        title = f"Budget {name}: 100% uppnådd"
        severity = ops_alerts.SEVERITY_CRITICAL
    elif threshold >= 0.8:
        title = f"Budget {name}: 80% uppnådd"
        severity = ops_alerts.SEVERITY_WARNING
    else:
        title = f"Budget {name}: {int(threshold * 100)}% uppnådd"
        severity = ops_alerts.SEVERITY_INFO
    detail = f"Spend hittills: {cost} {currency} (budget {budget_amount} {currency})"
    return ops_alerts.raise_alert(
        kind="budget_threshold",
        source=name,
        title=title,
        detail=detail,
        severity=severity,
        last_message=json.dumps(data, default=str)[:500],
    )


def _route_generic(data: dict[str, Any]) -> str | None:
    return ops_alerts.raise_alert(
        kind=str(data["kind"]),
        source=str(data.get("source") or "external"),
        title=str(data.get("title") or data["kind"]),
        detail=str(data.get("detail") or ""),
        severity=str(data.get("severity") or ops_alerts.SEVERITY_WARNING),
        client_id=data.get("client_id"),
        last_message=str(data.get("last_message") or "")[:500],
    )


def _iso(ts: Any) -> str | None:
    if ts is None:
        return None
    try:
        return ts.isoformat()
    except AttributeError:
        return str(ts)
