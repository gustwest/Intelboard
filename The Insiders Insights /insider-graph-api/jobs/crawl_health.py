"""Cloud Run Job: crawl-health (P2, passivt lager).

Läser GCS usage-loggarna EN gång, aggregerar AI-crawler-träffar per kund, och skriver
clients/{cid}/crawl_health/latest. Globalt jobb — loggen är gemensam för alla kunder, så
ingen fan-out behövs (till skillnad från LLM-tunga per-kund-jobb).

Idempotent: räknar om hela fönstret (default 30 dgr) varje körning och skriver ett dok
även för kunder utan träffar (0-dok → frontend visar 'Inväntar första crawl').

Self-no-op om usage-log-bucketen inte är konfigurerad (settings.usage_log_bucket tom).
"""
import argparse
import logging
import os
from datetime import datetime, timezone

import firestore_client as fs
from jobs._run_tracker import record_run
from services import crawl_health

log = logging.getLogger("jobs.crawl_health")

WINDOW_DAYS = int(os.environ.get("CRAWL_HEALTH_WINDOW_DAYS", "30"))


def run(window_days: int = WINDOW_DAYS) -> None:
    with record_run("crawl_health"):
        known = set(fs.iter_client_ids())
        if not known:
            log.info("crawl-health: inga kunder — hoppar över")
            return
        rows = crawl_health.read_recent_usage_rows(window_days=window_days)
        agg = crawl_health.aggregate_rows(rows, known)
        now_iso = datetime.now(timezone.utc).isoformat()
        total_hits = 0
        for cid in known:
            doc = crawl_health.build_doc(agg.get(cid), window_days, now_iso=now_iso)
            fs.crawl_health_doc(cid).set(doc)
            total_hits += doc["total_hits"]
        log.info(
            "crawl-health: %d kund(er), %d AI-crawler-träffar i fönstret (%d dgr)",
            len(known), total_hits, window_days,
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    argparse.ArgumentParser(description="Aggregera AI-crawler-träffar ur GCS usage-loggar").parse_args()
    run()
