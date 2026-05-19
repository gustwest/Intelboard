"""Cloud Run Job: compile-schema.

Triggas event-drivet via Eventarc (Firestore write till raw_items/) eller
manuellt. Bygger JSON-LD-graf och laddar upp till GCS bakom Cloud CDN.

Change-agent-logiken (skipa upload om grafen är oförändrad) körs här.
"""
import argparse
import json
import logging

from google.cloud import firestore, storage

import firestore_client as fs
from config import settings
from schema_org.compiler import compile_client

log = logging.getLogger("jobs.compile_schema")


def run(client_id: str) -> None:
    graph = compile_client(client_id)
    payload = json.dumps(graph, ensure_ascii=False, default=str)

    if not settings.cdn_bucket:
        log.warning("CDN_BUCKET not configured — skipping upload")
        print(payload)
        return

    bucket = storage.Client().bucket(settings.cdn_bucket)
    blob = bucket.blob(f"clients/{client_id}/schema.json")

    if blob.exists():
        existing = blob.download_as_text()
        if existing == payload:
            log.info("no change for %s — skipping upload", client_id)
            return

    blob.upload_from_string(payload, content_type="application/ld+json")
    blob.cache_control = "public, max-age=300"
    blob.patch()

    fs.client_doc(client_id).update(
        {
            "cdn_url": f"{settings.cdn_base_url}/clients/{client_id}/schema.json",
            "last_compiled": firestore.SERVER_TIMESTAMP,
        }
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    run(args.client_id)
