"""Cloud Run Job: scrape-website.

Triggas veckovis via Cloud Scheduler. Iterar kunder som har website-config,
crawlar domänen och skriver RawItems till raw_items_company.

Till skillnad från scrape-active (dagligen, .add() → slumpmässigt id) persisterar
det här jobbet **idempotent**: varje chunk har ett stabilt id, så omkörning skriver
över i stället för att hopa dubbletter. En cadence-guard hoppar över kunder som
crawlats inom de senaste 7 dagarna (skydd om jobbet triggas oftare).

    gcloud run jobs deploy scrape-website \\
      --image=.../insider-graph-api:latest \\
      --command python --args -m,jobs.scrape_website \\
      --region europe-north1
"""
import logging
from datetime import datetime, timedelta, timezone

import connectors
import firestore_client as fs
from connectors.base import ConnectorConfig

log = logging.getLogger("jobs.scrape_website")

MIN_INTERVAL = timedelta(days=7)


def run() -> None:
    connector = connectors.get("website")()
    for client_id, client in fs.iter_clients():
        website = (client.get("settings") or {}).get("website")
        if not website:
            continue
        if _crawled_recently(client):
            log.info("skipping %s — crawled within %s", client_id, MIN_INTERVAL)
            continue

        config = ConnectorConfig(client_id=client_id, params={"website": website})
        count = 0
        col = fs.raw_items_company_col(client_id)
        for item in connector.fetch(config):
            col.document(item.item_id).set(_payload(item))  # idempotent
            count += 1
        fs.client_doc(client_id).update({"website_last_crawled_at": datetime.now(timezone.utc)})
        log.info("website: wrote %s chunks for %s", count, client_id)


def _crawled_recently(client: dict) -> bool:
    last = client.get("website_last_crawled_at")
    if not isinstance(last, datetime):
        return False
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last < MIN_INTERVAL


def _payload(item) -> dict:
    return {
        "source": item.source,
        "schema_type": item.schema_type,
        "content": item.content,
        "url": item.url,
        "published_at": item.published_at,
        "included_in_output": True,
        **item.extra,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
