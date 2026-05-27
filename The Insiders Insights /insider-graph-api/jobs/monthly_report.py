"""Cloud Run Job: monthly-report.

Bygger + persisterar GEO-riskloopens månadsrapport (skiva 3) för en kund i
clients/{cid}/monthly_reports/{YYYY-MM}. Triggas månadsvis (Cloud Scheduler) eller
manuellt. Läs/visa den via routers/reports.py.
"""
import argparse
import logging

from jobs._run_tracker import record_run
from services.monthly_report import run as build_report

log = logging.getLogger("jobs.monthly_report")


def run(client_id: str, month: str | None = None) -> None:
    with record_run("monthly_report", client_id) as r:
        result = build_report(client_id, month)
        log.info("monthly report for %s: %s", client_id, "ok" if result else "skipped")
        r.summary = {"built": bool(result)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--month", default=None, help="YYYY-MM (default: innevarande)")
    args = parser.parse_args()
    run(args.client_id, args.month)
