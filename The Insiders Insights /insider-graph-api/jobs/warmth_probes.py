"""Cloud Run Job: warmth-probes.

Mäter hur AI-motorerna uppfattar varje kund per värmedimension (spec §8) och skriver
polling_results/warmth-latest. compute_trust_gap läser perceptionen därifrån. Triggas på
egen kadens (Cloud Scheduler) — motoranropen kostar, kör inte oftare än nödvändigt.

OBS: perceptions-talen ska INTE visas skarpt för kund förrän kalibreringen (#9) är låst.
"""
import logging

import firestore_client as fs
from services.warmth_probes import run_for_client

log = logging.getLogger("jobs.warmth_probes")


def run() -> None:
    count = 0
    for client_id, _ in fs.iter_clients():
        try:
            if run_for_client(client_id):
                count += 1
        except Exception as exc:  # noqa: BLE001
            log.exception("warmth-probes failed for %s: %s", client_id, exc)
    log.info("warmth-probed %d clients", count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
