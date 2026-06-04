"""Cloud Run Job: warmth-probes.

Mäter hur AI-motorerna uppfattar varje kund per värmedimension (spec §8) och skriver
polling_results/warmth-latest. compute_trust_gap läser perceptionen därifrån. Triggas på
egen kadens (Cloud Scheduler) — motoranropen kostar, kör inte oftare än nödvändigt.

OBS: perceptions-talen ska INTE visas skarpt för kund förrän kalibreringen (#9) är låst.

Sharded: läser CLOUD_RUN_TASK_INDEX/COUNT — se jobs/risk_detect_all för mönstret.
"""
import argparse
import logging
from datetime import datetime, timedelta, timezone

import firestore_client as fs
from jobs._run_tracker import record_run
from services.warmth_probes import run_for_client

log = logging.getLogger("jobs.warmth_probes")


def reap_stale_runs(older_than_hours: int = 6) -> int:
    """Stäng föräldralösa job_runs som fastnat i status=running (körningen dog
    innan record_run hann skriva slutstatus — t.ex. timeout/OOM mitt i). Markeras
    'failed' med en tydlig orsak så de inte visar 'kör fortfarande' i evigheter i
    aktivitetsflödet. Returnerar antal reapade. Best-effort per dokument."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    reaped = 0
    for run_id, data in fs.iter_job_runs():
        if data.get("status") != "running":
            continue
        started = data.get("started_at")
        # started_at kan vara datetime (Firestore) eller ISO-sträng. Tolka båda.
        ts = None
        if isinstance(started, datetime):
            ts = started if started.tzinfo else started.replace(tzinfo=timezone.utc)
        elif isinstance(started, str):
            try:
                ts = datetime.fromisoformat(started.replace("Z", "+00:00"))
            except ValueError:
                ts = None
        if ts is not None and ts >= cutoff:
            continue  # nyligen startad — kan vara genuint igång
        try:
            fs.job_run_doc(run_id).set(
                {"status": "failed", "error_message": "reaped: föräldralös running-post (körningen dog innan slutstatus)"},
                merge=True,
            )
            reaped += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("reap misslyckades för %s: %s", run_id, exc)
    log.info("reapade %d föräldralösa running-poster (äldre än %dh)", reaped, older_than_hours)
    return reaped


def run_one(client_id: str) -> None:
    """Probe:a EN kund. För riktad körning (debug, e2e-test, ad-hoc) — speglar
    --client-id-mönstret i jobs/compute_trust_gap. Sharding kringgås helt."""
    with record_run("warmth_probes", client_id) as r:
        if run_for_client(client_id):
            r.summary = {"probed": True}
            log.info("warmth-probed %s (riktad körning)", client_id)
        else:
            r.summary = {"probed": False}
            log.warning("warmth-probes returnerade None för %s (saknar motorer/domare?)", client_id)


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
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", default=None, help="enskild kund (default: sharded fan-out över alla)")
    parser.add_argument("--reap-stale", action="store_true", help="reapa föräldralösa running-poster, kör INTE probes")
    parser.add_argument("--reap-hours", type=int, default=6, help="reap-tröskel i timmar (default 6)")
    args = parser.parse_args()
    if args.reap_stale:
        reap_stale_runs(args.reap_hours)
    elif args.client_id:
        run_one(args.client_id)
    else:
        run()
