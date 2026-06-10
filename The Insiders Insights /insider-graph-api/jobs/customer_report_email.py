"""Cloud Run Job: customer-report-email (Spår B2).

Skickar en KUND-säker månadssammanfattning till kundens kontaktperson, destillerad ur
den redan persisterade månadsrapporten (clients/{cid}/monthly_reports/{YYYY-MM}). Körs
EFTER monthly_report (samma kadens) eller manuellt.

Self-no-op: saknas rapport / kundkontakt / Brevo-konfig loggas det bara — inget fel.
Felnotiser går aldrig den här vägen; det här är värde-/statusutskick till kunden.
"""
import argparse
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services import contacts, notifications
from services.monthly_report import current_month, render_customer_email

log = logging.getLogger("jobs.customer_report_email")


def run(client_id: str, month: str | None = None) -> dict:
    with record_run("customer_report_email", client_id) as r:
        month = month or current_month()
        snap = fs.monthly_report_doc(client_id, month).get()
        if not snap.exists:
            log.info("customer-report-email %s/%s: ingen rapport — hoppar över", client_id, month)
            r.summary = {"sent": False, "reason": "no_report", "month": month}
            return r.summary
        model = snap.to_dict() or {}
        data = fs.client_doc(client_id).get().to_dict() or {}
        # A1: mejlet följer kundens språk (default sv om ej satt).
        subject, html_body, text_body = render_customer_email(
            model, lang=data.get("language"), contact_name=data.get("contact_name"),
        )
        result = notifications.send_customer_email(
            contacts.primary_email(data), subject, html_body, text_body,
            cc=contacts.secondary_emails(data),  # N2: cc sekundärkontakter
        )
        r.summary = {**result, "month": month}
        return r.summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--month", default=None, help="YYYY-MM (default: innevarande)")
    args = parser.parse_args()
    run(args.client_id, args.month)
