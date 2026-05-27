"""Cloud Run Job: monthly-report-all.

Månadsvis fan-out av GEO-riskloopens skiva 3 — bygger + persisterar månadsrapporten
för ALLA kunder (innevarande månad) i clients/{cid}/monthly_reports/{YYYY-MM}. Körs den
1:a, efter månadens senaste veckovisa risk-detect, så rapporten speglar färska findings.

Per-kund-jobbet (jobs.monthly_report) behålls för den manuella knappen i UI:t.
"""
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.monthly_report import run as build_report

log = logging.getLogger("jobs.monthly_report_all")


def run() -> None:
    count = 0
    for client_id, _ in fs.iter_clients():
        try:
            with record_run("monthly_report", client_id) as r:
                result = build_report(client_id)
                r.summary = {"built": bool(result)}
                if result:
                    count += 1
        except Exception as exc:
            log.exception("monthly-report failed for %s: %s", client_id, exc)
    log.info("monthly-report: byggde rapport för %d kund(er)", count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
