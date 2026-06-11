"""Cloud Run Job: alignment-audit.

Sluter loopen probe → gap → riktad claim-beställning (services/alignment_audit): för
varje aktiv persona × värmedimension avgör en matcher om profilsidan svarar på det
probe-frågorna faktiskt frågar, och varje gap blir en ClaimOrder. Resultatet skrivs till
polling_results/alignment-latest så ops kan läsa gap + beställningar. Claim-orders
persisteras INTE automatiskt som claims (medvetet ops-beslut — se run_and_store).

Triggas på egen kadens (Cloud Scheduler) — matcher-anropen kostar (≤ 5 personor × 6 dim
= 30 LLM-anrop/kund), kör inte oftare än nödvändigt. Speglar jobs/warmth_probes:
samma sharding (CLOUD_RUN_TASK_INDEX/COUNT), samma record_run, samma --client-id-mönster.
"""
import argparse
import logging

import firestore_client as fs
from jobs._run_tracker import record_run
from services.alignment_audit import run_and_store

log = logging.getLogger("jobs.alignment_audit")


def run_one(client_id: str) -> None:
    """Audita EN kund. För riktad körning (debug, e2e-test, ad-hoc) — speglar
    --client-id-mönstret i jobs/warmth_probes. Sharding kringgås helt."""
    with record_run("alignment_audit", client_id) as r:
        doc = run_and_store(client_id)
        if doc is not None:
            r.summary = {"audited": True, "gaps": doc["coverage"]["gaps"], "total": doc["coverage"]["total"]}
            log.info("alignment-auditerade %s (riktad körning)", client_id)
        else:
            r.summary = {"audited": False}
            log.warning("alignment-audit returnerade None för %s (saknar domarmodell?)", client_id)


def run() -> None:
    task_index, task_count = fs.shard_from_env()
    log.info("alignment-audit: shard %d/%d", task_index, task_count)
    count = 0
    for client_id in fs.iter_client_ids_shard(task_index, task_count):
        try:
            with record_run("alignment_audit", client_id) as r:
                doc = run_and_store(client_id)
                if doc is not None:
                    r.summary = {"audited": True, "gaps": doc["coverage"]["gaps"], "total": doc["coverage"]["total"]}
                    count += 1
        except Exception as exc:  # noqa: BLE001
            log.exception("alignment-audit failed for %s: %s", client_id, exc)
    log.info("alignment-auditerade %d clients (shard %d/%d)", count, task_index, task_count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", default=None, help="enskild kund (default: sharded fan-out över alla)")
    args = parser.parse_args()
    if args.client_id:
        run_one(args.client_id)
    else:
        run()
