"""Utgående notifieringar via SendGrid (spec §4.1).

Kvartals-påminnelsen är INTERN: vi samlar in kundens LinkedIn-kapacitetsdata själva,
så mejlet går till vårt eget ops-team (`ops_notify_email`) — inte till kunden — och
namnger vilken kund det gäller.

Self-no-op och felsäker: saknas SendGrid-nyckel, avsändare eller ops-mottagare loggas
bara att vi skulle notifierat — To-Do:n i dashboarden skapas ändå och ett SendGrid-fel
får aldrig fälla ett bakgrundsjobb. SDK:n importeras lazy.
"""
from __future__ import annotations

import logging
from typing import Any

from config import settings

log = logging.getLogger(__name__)


def send_quarterly_reminder(client_id: str, client: dict, message: str) -> dict[str, Any]:
    """Påminn ops-teamet om att samla in en kunds kvartalsdata. Returnerar en statusdict."""
    if not (settings.sendgrid_api_key and settings.notify_from_email and settings.ops_notify_email):
        log.info("notify %s (ej skickat — saknar konfig): %s", client_id, message)
        return {"sent": False, "reason": "not_configured"}

    customer = (client or {}).get("company_name") or client_id
    subject = f"Kvartalsvis AI-uppdatering: samla in LinkedIn-data för {customer}"
    body = f"{message}\n\nKund: {customer} ({client_id})"
    try:
        _deliver(settings.ops_notify_email, subject, body)
    except Exception as exc:  # ett mejlfel får inte fälla jobbet
        log.warning("notify %s: SendGrid-fel: %s", client_id, exc)
        return {"sent": False, "reason": "send_failed"}
    log.info("notify %s: skickade kvartals-påminnelse till ops (%s)", client_id, settings.ops_notify_email)
    return {"sent": True, "to": settings.ops_notify_email}


def send_customer_email(
    to_email: str | None, subject: str, html_body: str, text_body: str,
) -> dict[str, Any]:
    """Skicka ett KUND-vänt mejl (Spår B: installationskit, månadsmejl).

    Till skillnad från kvartals-påminnelsen går detta till kundens kontakt, inte ops.
    Self-no-op + felsäkert (samma mönster): saknad SendGrid-konfig eller mottagare
    loggas bara; ett mejlfel fäller aldrig anroparen."""
    if not (settings.sendgrid_api_key and settings.notify_from_email):
        log.info("customer-email (ej skickat — saknar SendGrid-konfig): %s", subject)
        return {"sent": False, "reason": "not_configured"}
    if not to_email:
        log.info("customer-email (ej skickat — ingen kundkontakt): %s", subject)
        return {"sent": False, "reason": "no_contact"}
    try:
        _deliver(to_email, subject, text_body, html=html_body)
    except Exception as exc:  # ett mejlfel får inte fälla anroparen
        log.warning("customer-email till %s: SendGrid-fel: %s", to_email, exc)
        return {"sent": False, "reason": "send_failed"}
    log.info("customer-email: skickade '%s' till %s", subject, to_email)
    return {"sent": True, "to": to_email}


# Konstruktions-söm (patchas i tester så inget nätverksanrop sker).
def _deliver(to_email: str, subject: str, body: str, html: str | None = None) -> None:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    mail = Mail(
        from_email=settings.notify_from_email,
        to_emails=to_email,
        subject=subject,
        plain_text_content=body,
        html_content=html,  # None → SendGrid skickar bara plain-text
    )
    SendGridAPIClient(settings.sendgrid_api_key).send(mail)
