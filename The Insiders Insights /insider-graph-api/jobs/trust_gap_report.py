"""Cloud Run Job: trust-gap-report.

Fryser en daterad Humaniseringstäckning-snapshot (spec §5.6) ur det levande trust_gap-
tillståndet. Triggas månadsvis (Cloud Scheduler) eller on-demand. Kräver att
compute_trust_gap körts (annars no-op).
"""
import argparse
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.trust_gap_report import run as build_snapshot

log = logging.getLogger("jobs.trust_gap_report")


def run(client_id: str, date: str | None = None) -> None:
    with record_run("trust_gap_report", client_id) as r:
        result = build_snapshot(client_id, date)
        log.info("trust-gap-report för %s: %s", client_id, "ok" if result else "skipped (ingen trust_gap)")
        r.summary = {"built": bool(result)}


def run_all(date: str | None = None) -> None:
    """Fan-out över alla kunder (månatlig snapshot via Cloud Scheduler)."""
    count = 0
    for client_id, _ in fs.iter_clients():
        try:
            if build_snapshot(client_id, date):
                count += 1
        except Exception as exc:  # noqa: BLE001
            log.exception("trust-gap-report misslyckades för %s: %s", client_id, exc)
    log.info("trust-gap-report kördes för %d kunder", count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", default=None, help="enskild kund (default: alla)")
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: idag)")
    args = parser.parse_args()
    if args.client_id:
        run(args.client_id, args.date)
    else:
        run_all(args.date)
