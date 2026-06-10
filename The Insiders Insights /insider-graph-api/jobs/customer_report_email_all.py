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

log = logging.getLogger("jobs.customer_report_email_all")


def run() -> None:
    sent = 0
    for client_id, _ in fs.iter_clients():
        try:
            result = send_one(client_id)
            if result.get("sent"):
                sent += 1
        except Exception as exc:  # en kund får inte fälla hela fan-out:en
            log.exception("customer-report-email failed for %s: %s", client_id, exc)
    log.info("customer-report-email: skickade till %d kund(er)", sent)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
