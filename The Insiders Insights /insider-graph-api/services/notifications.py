"""Utgående notifieringar via Brevo (EU-baserad mejlleverantör, spec §4.1).

EU-val 2026-06-07: persondata (kontaktadresser) stannar i EU — konsekvent med EU-only-
beslutet för resonemangsmodellerna (Vertex EU). Leverantörsbytet är isolerat till
`_deliver` nedan; allt övrigt flöde är oförändrat.

Kvartals-påminnelsen är INTERN: vi samlar in kundens LinkedIn-kapacitetsdata själva,
så mejlet går till vårt eget ops-team (`ops_notify_email`) — inte till kunden — och
namnger vilken kund det gäller.

Self-no-op och felsäker: saknas Brevo-nyckel, avsändare eller ops-mottagare loggas
bara att vi skulle notifierat — To-Do:n i dashboarden skapas ändå och ett mejl-fel
får aldrig fälla ett bakgrundsjobb.
"""
from __future__ import annotations

import logging
from typing import Any

from config import settings
from services.log_redact import mask_email

log = logging.getLogger(__name__)


def send_quarterly_reminder(client_id: str, client: dict, message: str) -> dict[str, Any]:
    """Påminn ops-teamet om att samla in en kunds kvartalsdata. Returnerar en statusdict."""
    if not (settings.brevo_api_key and settings.notify_from_email and settings.ops_notify_email):
        log.info("notify %s (ej skickat — saknar konfig): %s", client_id, message)
        return {"sent": False, "reason": "not_configured"}

    customer = (client or {}).get("company_name") or client_id
    subject = f"Kvartalsvis AI-uppdatering: samla in LinkedIn-data för {customer}"
    body = f"{message}\n\nKund: {customer} ({client_id})"
    try:
        _deliver(settings.ops_notify_email, subject, body)
    except Exception as exc:  # ett mejlfel får inte fälla jobbet
        log.warning("notify %s: Brevo-fel: %s", client_id, exc)
        return {"sent": False, "reason": "send_failed"}
    log.info("notify %s: skickade kvartals-påminnelse till ops (%s)", client_id, mask_email(settings.ops_notify_email))
    return {"sent": True, "to": settings.ops_notify_email}


def send_customer_email(
    to_email: str | None, subject: str, html_body: str, text_body: str,
) -> dict[str, Any]:
    """Skicka ett KUND-vänt mejl (Spår B: installationskit, månadsmejl).

    Till skillnad från kvartals-påminnelsen går detta till kundens kontakt, inte ops.
    Self-no-op + felsäkert (samma mönster): saknad Brevo-konfig eller mottagare
    loggas bara; ett mejlfel fäller aldrig anroparen."""
    if not (settings.brevo_api_key and settings.notify_from_email):
        log.info("customer-email (ej skickat — saknar Brevo-konfig): %s", subject)
        return {"sent": False, "reason": "not_configured"}
    if not to_email:
        log.info("customer-email (ej skickat — ingen kundkontakt): %s", subject)
        return {"sent": False, "reason": "no_contact"}
    try:
        _deliver(to_email, subject, text_body, html=html_body)
    except Exception as exc:  # ett mejlfel får inte fälla anroparen
        log.warning("customer-email till %s: Brevo-fel: %s", mask_email(to_email), exc)
        return {"sent": False, "reason": "send_failed"}
    log.info("customer-email: skickade '%s' till %s", subject, mask_email(to_email))
    return {"sent": True, "to": to_email}


# Konstruktions-söm (patchas i tester så inget nätverksanrop sker). Brevo
# transaktions-API: en enkel HTTPS-POST → ingen extra SDK-dependens (httpx finns redan).
BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


def _deliver(to_email: str, subject: str, body: str, html: str | None = None) -> None:
    import httpx

    payload: dict[str, Any] = {
        "sender": {"email": settings.notify_from_email},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": body,
    }
    if html:  # None → bara plain-text
        payload["htmlContent"] = html
    resp = httpx.post(
        BREVO_SEND_URL,
        headers={
            "api-key": settings.brevo_api_key,
            "accept": "application/json",
            "content-type": "application/json",
        },
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()  # icke-2xx → fångas av anroparens try/except → send_failed
