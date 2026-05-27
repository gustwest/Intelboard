"""Cloud Run Job: trust-gap-report.

Fryser en daterad Humaniseringstäckning-snapshot (spec §5.6) ur det levande trust_gap-
tillståndet. Triggas månadsvis (Cloud Scheduler) eller on-demand. Kräver att
compute_trust_gap körts (annars no-op).
"""
import argparse
import logging

from services.trust_gap_report import run as build_snapshot

log = logging.getLogger("jobs.trust_gap_report")


def run(client_id: str, date: str | None = None) -> None:
    result = build_snapshot(client_id, date)
    log.info("trust-gap-report för %s: %s", client_id, "ok" if result else "skipped (ingen trust_gap)")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: idag)")
    args = parser.parse_args()
    run(args.client_id, args.date)
