"""Cloud Run Job: warmth-probes.

Mäter hur AI-motorerna uppfattar varje kund per värmedimension (spec §8) och skriver
polling_results/warmth-latest. compute_trust_gap läser perceptionen därifrån. Triggas på
egen kadens (Cloud Scheduler) — motoranropen kostar, kör inte oftare än nödvändigt.

OBS: perceptions-talen ska INTE visas skarpt för kund förrän kalibreringen (#9) är låst.

Sharded: läser CLOUD_RUN_TASK_INDEX/COUNT — se jobs/risk_detect_all för mönstret.
"""
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.warmth_probes import run_for_client

log = logging.getLogger("jobs.warmth_probes")


def run() -> None:
    task_index, task_count = fs.shard_from_env()
    log.info("warmth-probes: shard %d/%d", task_index, task_count)
    count = 0
    for client_id in fs.iter_client_ids_shard(task_index, task_count):
        try:
            with record_run("warmth_probes", client_id) as r:
                if run_for_client(client_id):
                    r.summary = {"probed": True}
                    count += 1
        except Exception as exc:  # noqa: BLE001
            log.exception("warmth-probes failed for %s: %s", client_id, exc)
    log.info("warmth-probed %d clients (shard %d/%d)", count, task_index, task_count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
