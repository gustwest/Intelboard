"""Webhooks — externa system som skickar data till Insider Graph.

Inkommande mejl (inbound parse):
  - MX-record på `inbox.insidergraph.io` pekar mot inbound-providerns MX.
  - Episodiska noder har adress `{client_id}.{employee_id}@inbox.insidergraph.io`.
  - Providern POSTar multipart/form-data hit när mail kommer in.

Confidence-tröskel: items med confidence < 0.7 sparas men markeras
`needs_review=True` och `included_in_output=False`.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Form, HTTPException, Query
from google.cloud import firestore

import firestore_client as fs
from config import settings
from services.log_redact import mask_email
from services.email_extraction import extract

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

ADDRESS_RE = re.compile(r"^([a-z0-9\-]+)\.([a-z0-9\-]+)@", re.IGNORECASE)
CONFIDENCE_THRESHOLD = 0.7


@router.post("/inbound")
async def inbound_mail(
    token: str = Query(""),
    to: str = Form(""),
    sender: str = Form("", alias="from"),
    subject: str = Form(""),
    text: str = Form(""),
    html: str = Form(""),
):
    # AVSTÄNGD som standard: vi skickar via Brevo och inbound-parse är inte kopplat.
    # Endpointen skriver raw_items, så en öppen oautentiserad väg vore data-poisoning.
    # Kräver en delad token (`?token=`) mot inbound-secreten; tom secret = avvisa allt
    # (säker default, jfr ops-webhooken). Återaktiveras genom att sätta secreten och
    # låta inbound-providern POSTa med token.
    if not settings.inbound_webhook_secret or token != settings.inbound_webhook_secret:
        raise HTTPException(403, "inbound mail webhook disabled")
    log.info("inbound mail to=%s from=%s subject=%s", mask_email(to), mask_email(sender), subject)

    parsed = _parse_address(to)
    if not parsed:
        raise HTTPException(400, f"unrecognised inbound address: {to!r}")
    client_id, employee_id = parsed

    employee_ref = fs.employee_doc(client_id, employee_id)
    if not employee_ref.get().exists:
        raise HTTPException(404, f"unknown recipient: {client_id}/{employee_id}")

    body = (text or _strip_html(html)).strip()
    if not body:
        raise HTTPException(400, "empty mail body")

    full_text = f"Ämne: {subject}\n\n{body}" if subject else body
    event = extract(full_text)
    if event is None:
        return {"status": "ignored", "reason": "no extractable data"}

    needs_review = event.confidence < CONFIDENCE_THRESHOLD

    fs.raw_items_col(client_id, employee_id).add(
        {
            "source": "email",
            "schema_type": event.schema_type,
            "content": event.about or event.name,
            "url": None,
            "published_at": _parse_or_now(event.start_date),
            "name": event.name,
            "organizer": event.organizer,
            "start_date": event.start_date,
            "from_email": sender,
            "subject": subject,
            "confidence": event.confidence,
            "needs_review": needs_review,
            "included_in_output": not needs_review,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
    )

    return {
        "status": "accepted",
        "client_id": client_id,
        "employee_id": employee_id,
        "schema_type": event.schema_type,
        "confidence": event.confidence,
        "needs_review": needs_review,
    }


def _parse_address(to_field: str) -> tuple[str, str] | None:
    """Tar 'foo.bar@inbox.insidergraph.io' (eller med Name <addr>) → ('foo', 'bar')."""
    match = re.search(r"<([^>]+)>", to_field)
    addr = match.group(1) if match else to_field
    m = ADDRESS_RE.match(addr.strip())
    return (m.group(1).lower(), m.group(2).lower()) if m else None


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "")


def _parse_or_now(value: str | None) -> datetime:
    if value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)
