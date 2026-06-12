"""Cloud Run Job: compile-all-schemas.

Iterar alla kunder och kompilerar JSON-LD per kund. Wraps jobs.compile_schema
för att vara cron-triggable utan per-kund-argument.

Skriver dessutom discoverability-filer på CDN-roten: robots.txt (släpper in
AI-crawlers + pekar på sitemap) och sitemap.xml (alla profilsidor).

Change-agentens diff-logik i compile_schema.run() hindrar onödiga uploads.
"""
import logging

from google.cloud import storage

import firestore_client as fs
from config import settings
from jobs.compile_schema import run as compile_one
from schema_org.urls import served_url

log = logging.getLogger("jobs.compile_all")


def run() -> None:
    compiled: list[str] = []
    for client_id, _ in fs.iter_clients():
        try:
            compile_one(client_id)
            compiled.append(client_id)
        except Exception as exc:
            log.exception("compile failed for %s: %s", client_id, exc)
    log.info("compiled %d clients", len(compiled))

    if settings.cdn_bucket and compiled:
        _write_discoverability(compiled)


def _write_discoverability(client_ids: list[str]) -> None:
    base = settings.cdn_base_url.rstrip("/")
    bucket = storage.Client().bucket(settings.cdn_bucket)

    robots = f"User-agent: *\nAllow: /\n\nSitemap: {base}/sitemap.xml\n"
    _put(bucket, "robots.txt", robots, "text/plain; charset=utf-8")

    # served_url respekterar CDN_CLEAN_URLS → samma rena URL som sidans <link rel=canonical>.
    # (Hårdkodat /clients/{cid}/ gav HTTP 404 i clean-läge → crawlers hittade aldrig profilerna.)
    urls = "".join(f"  <url><loc>{served_url(cid)}</loc></url>\n" for cid in client_ids)
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}</urlset>\n"
    )
    _put(bucket, "sitemap.xml", sitemap, "application/xml; charset=utf-8")
    log.info("wrote robots.txt + sitemap.xml (%d urls)", len(client_ids))


def _put(bucket, path: str, body: str, content_type: str) -> None:
    blob = bucket.blob(path)
    blob.upload_from_string(body, content_type=content_type)
    blob.cache_control = "public, max-age=3600"
    blob.patch()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
