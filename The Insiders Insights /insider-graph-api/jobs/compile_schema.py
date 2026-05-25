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
from schema_org.profile_page import render_llms_txt, render_profile_html

log = logging.getLogger("jobs.compile_schema")


def run(client_id: str) -> None:
    graph = compile_client(client_id)
    payload = json.dumps(graph, ensure_ascii=False, default=str)
    profile_html = render_profile_html(client_id)
    llms_txt = render_llms_txt(client_id)

    if not settings.cdn_bucket:
        log.warning("CDN_BUCKET not configured — skipping upload")
        print(payload)
        return

    bucket = storage.Client().bucket(settings.cdn_bucket)
    schema_blob = bucket.blob(f"clients/{client_id}/schema.json")

    if schema_blob.exists() and schema_blob.download_as_text() == payload:
        log.info("no change for %s — skipping upload", client_id)
        return

    schema_blob.upload_from_string(payload, content_type="application/ld+json")
    schema_blob.cache_control = "public, max-age=300"
    schema_blob.patch()

    # Profilsidan (lager 2): statisk HTML bredvid schema.json, samma render-modell.
    page_blob = bucket.blob(f"clients/{client_id}/index.html")
    page_blob.upload_from_string(profile_html, content_type="text/html; charset=utf-8")
    page_blob.cache_control = "public, max-age=300"
    page_blob.patch()

    # llms.txt: markdown-summering för AI-crawlers (discoverability).
    llms_blob = bucket.blob(f"clients/{client_id}/llms.txt")
    llms_blob.upload_from_string(llms_txt, content_type="text/plain; charset=utf-8")
    llms_blob.cache_control = "public, max-age=300"
    llms_blob.patch()

    fs.client_doc(client_id).update(
        {
            "cdn_url": f"{settings.cdn_base_url}/clients/{client_id}/schema.json",
            "profile_url": f"{settings.cdn_base_url}/clients/{client_id}/",
            "last_compiled": firestore.SERVER_TIMESTAMP,
        }
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    run(args.client_id)
