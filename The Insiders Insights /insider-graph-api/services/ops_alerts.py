"""Ops-alerts — system-interna notiser för drift-händelser.

Ersätter (på sikt) email-baserad alerting för allt som inte är "tjänsten är nere".
Job-failures, budget-trösklar, LLM-leverantörsproblem och liknande hamnar i
inboxens globala kategori `ops_alerts` så ops ser dem i samma yta som review-jobb.

Designprinciper:

- **Dedup på (kind, source).** Doc-id = sha1(kind|source) → samma signal träffar
  alltid samma dokument. Återkommande failures räknar upp `occurrence_count` och
  uppdaterar `last_seen_at` + `last_message` i stället för att skapa nya alerts.
- **Auto-resolve.** När motsvarande problem upphör (t.ex. en lyckad jobb-körning
  efter en failed) anropar uppringaren `maybe_resolve(kind, source)`. Det stänger
  en öppen alert med samma nyckel — annars staplas resolverade jobb-failures i
  inboxen tills någon manuellt rensar.
- **Re-open med historik.** Om en alert var resolved och samma problem dyker upp
  igen ökar `reopen_count` och status flippas tillbaka till open. Vi förlorar
  inte historiken; ops ser direkt att "den här har återkommit 3 gånger".
- **Får aldrig fälla anroparen.** Alla Firestore-anrop är best-effort: en transient
  Firestore-strul ska inte göra att ett jobb går från failed till crashed.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

import firestore_client as fs

log = logging.getLogger(__name__)

# Tillåtna severities; värdena är ordningsbara (low → high) för UI-sortering.
SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_CRITICAL = "critical"
_VALID_SEVERITIES = {SEVERITY_INFO, SEVERITY_WARNING, SEVERITY_CRITICAL}


def alert_id(kind: str, source: str) -> str:
    """Deterministisk dedup-nyckel. Korthashad (16 hex) för läsbarhet i Firestore-konsolen
    — kollisioner är försumbara för antal alerts vi pratar om (få hundra)."""
    return hashlib.sha1(f"{kind}|{source}".encode("utf-8")).hexdigest()[:16]


def raise_alert(
    *,
    kind: str,
    source: str,
    title: str,
    detail: str = "",
    severity: str = SEVERITY_WARNING,
    client_id: str | None = None,
    last_message: str | None = None,
) -> str | None:
    """Öppna eller uppdatera en alert.

    - Saknas alerten: skapa den med status=open, occurrence_count=1.
    - Finns den och är open: bump occurrence_count, uppdatera last_seen_at +
      last_message + severity (höjs aldrig nedåt automatiskt — vi tar maxet).
    - Finns den och är resolved: re-open, bump reopen_count, behåll historik.

    Returnerar alert-id (för loggning) eller None vid Firestore-fel.
    """
    if severity not in _VALID_SEVERITIES:
        severity = SEVERITY_WARNING

    aid = alert_id(kind, source)
    ref = fs.ops_alert_doc(aid)
    now = datetime.now(timezone.utc)

    try:
        snap = ref.get()
        existing = snap.to_dict() if snap.exists else None

        if existing is None:
            ref.set({
                "kind": kind,
                "source": source,
                "title": title,
                "detail": detail,
                "severity": severity,
                "client_id": client_id,
                "status": "open",
                "occurrence_count": 1,
                "reopen_count": 0,
                "first_seen_at": firestore.SERVER_TIMESTAMP,
                "last_seen_at": firestore.SERVER_TIMESTAMP,
                "last_message": last_message or "",
                "ack_by": None,
                "ack_at": None,
                "resolved_at": None,
            })
            log.info("ops_alert opened: kind=%s source=%s severity=%s", kind, source, severity)
            return aid

        update: dict[str, Any] = {
            "title": title,  # låt senaste anrop styra rubrik (kan vara mer specifik)
            "detail": detail or existing.get("detail", ""),
            "last_seen_at": firestore.SERVER_TIMESTAMP,
            "last_message": last_message or existing.get("last_message", ""),
            "severity": _max_severity(existing.get("severity", SEVERITY_INFO), severity),
            "client_id": client_id if client_id is not None else existing.get("client_id"),
        }
        if existing.get("status") == "resolved":
            # Återkommande problem — flippa tillbaka till open, behåll historik.
            update["status"] = "open"
            update["reopen_count"] = int(existing.get("reopen_count") or 0) + 1
            update["occurrence_count"] = 1
            update["resolved_at"] = None
            update["ack_by"] = None
            update["ack_at"] = None
        else:
            update["occurrence_count"] = int(existing.get("occurrence_count") or 0) + 1

        ref.update(update)
        return aid
    except Exception as exc:  # noqa: BLE001 — alerting får aldrig fälla anroparen
        log.warning("ops_alert raise failed (kind=%s source=%s): %s", kind, source, exc)
        return None


def maybe_resolve(*, kind: str, source: str, resolved_by: str = "auto") -> bool:
    """Stäng en öppen alert med samma (kind, source). No-op om ingen alert finns
    eller om den redan är resolved. Anropas t.ex. av _run_tracker när en jobb-
    körning lyckas — så en tidigare job_failed-alert auto-stängs."""
    aid = alert_id(kind, source)
    try:
        ref = fs.ops_alert_doc(aid)
        snap = ref.get()
        if not snap.exists:
            return False
        data = snap.to_dict() or {}
        if data.get("status") in ("resolved", None) and data.get("status") != "open":
            return False
        ref.update({
            "status": "resolved",
            "resolved_at": firestore.SERVER_TIMESTAMP,
            "resolved_by": resolved_by,
        })
        log.info("ops_alert auto-resolved: kind=%s source=%s by=%s", kind, source, resolved_by)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("ops_alert resolve failed (kind=%s source=%s): %s", kind, source, exc)
        return False


def ack(*, alert_id_value: str, ack_by: str) -> bool:
    """Manuell kvittering från UI:t. Behåller status=open men markerar att någon
    har sett alerten (försvinner inte ur inboxen förrän status=resolved)."""
    try:
        fs.ops_alert_doc(alert_id_value).update({
            "ack_by": ack_by,
            "ack_at": firestore.SERVER_TIMESTAMP,
        })
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("ops_alert ack failed (id=%s): %s", alert_id_value, exc)
        return False


def resolve(*, alert_id_value: str, resolved_by: str) -> bool:
    """Manuell resolve från UI:t — t.ex. när ops bedömt att problemet är hanterat
    även om autodetekteringen inte fångar det."""
    try:
        fs.ops_alert_doc(alert_id_value).update({
            "status": "resolved",
            "resolved_at": firestore.SERVER_TIMESTAMP,
            "resolved_by": resolved_by,
        })
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("ops_alert resolve failed (id=%s): %s", alert_id_value, exc)
        return False


_SEV_RANK = {SEVERITY_INFO: 1, SEVERITY_WARNING: 2, SEVERITY_CRITICAL: 3}


def _max_severity(a: str, b: str) -> str:
    return a if _SEV_RANK.get(a, 0) >= _SEV_RANK.get(b, 0) else b
