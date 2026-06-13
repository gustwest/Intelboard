"""Cloud Run Job: customer-report-email-all (Spår B2).

Månadsvis fan-out: skickar den kund-säkra månadssammanfattningen till varje kunds
kontaktperson. Körs den 1:a EFTER monthly-report-all (som bygger rapporterna), så
underlaget finns. Per-kund-jobbet (jobs.customer_report_email) behålls för manuell
sändning / endpoint.

Self-no-op per kund: saknad rapport / kundkontakt / Brevo-konfig hoppas tyst över.
Felnotiser går aldrig den här vägen — bara värde-/statusutskick till kunden.
"""
import logging

import firestore_client as fs
from jobs.customer_report_email import run as send_one
from services.monthly_report import current_month

log = logging.getLogger("jobs.customer_report_email_all")


def _should_send(cadence: str | None, month: str) -> bool:
    """B4b: per-kund e-postkadens. monthly (default) → varje månad; quarterly → bara
    kvartalsslut (mars/juni/sep/dec); off → aldrig. Det MANUELLA per-kund-jobbet
    respekterar inte detta — explicit ops-sändning ska alltid gå igenom."""
    c = (cadence or "monthly").strip().lower()
    if c == "off":
        return False
    if c == "quarterly":
        try:
            return int(month.split("-")[1]) % 3 == 0
        except (ValueError, IndexError):
            return True
    return True


def run() -> None:
    month = current_month()
    sent = skipped = 0
    for client_id, data in fs.iter_clients():
        if not _should_send((data or {}).get("email_cadence"), month):
            skipped += 1
            continue
        try:
            result = send_one(client_id)
            if result.get("sent"):
                sent += 1
        except Exception as exc:  # en kund får inte fälla hela fan-out:en
            log.exception("customer-report-email failed for %s: %s", client_id, exc)
    log.info("customer-report-email: skickade till %d kund(er), hoppade %d (kadens)", sent, skipped)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
