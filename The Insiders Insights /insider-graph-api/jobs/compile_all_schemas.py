"""Cloud Run Job: compile-all-schemas.

Iterar alla kunder och kompilerar JSON-LD per kund. Wraps jobs.compile_schema
för att vara cron-triggable utan per-kund-argument.

Change-agentens diff-logik i compile_schema.run() hindrar onödiga uploads.
"""
import logging

import firestore_client as fs
from jobs.compile_schema import run as compile_one

log = logging.getLogger("jobs.compile_all")


def run() -> None:
    count = 0
    for client_id, _ in fs.iter_clients():
        try:
            compile_one(client_id)
            count += 1
        except Exception as exc:
            log.exception("compile failed for %s: %s", client_id, exc)
    log.info("compiled %d clients", count)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
