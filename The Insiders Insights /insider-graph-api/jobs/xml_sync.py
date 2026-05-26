"""Cloud Run Job: xml-sync (spec §1.2).

Triggas var 24:e timme via Cloud Scheduler. För varje kund med jobfeed-connectorn
påslagen:

  1. Hämtar dagens platsannonser ur ATS-feeden (connectors/jobfeed.py).
  2. Persistar dem idempotent i raw_items_company (stabilt item_id → omkörning
     skriver över, inga dubbletter).
  3. Diffar dagens annons-id mot gårdagens (clients/{id}/job_feed_state/latest).
     Ett job_id som fanns igår men saknas idag = annonsen stängd → markeras
     closed_at + included_in_output=False (Decay Protocol tar vid i Slice 2).

    gcloud run jobs deploy xml-sync \\
      --image=.../insider-graph-api:latest \\
      --command python --args -m,jobs.xml_sync \\
      --region europe-north1

Connectorn är stateless; all diff-logik (vad som är nytt/stängt) bor här.
"""
import logging
from datetime import datetime, timezone

from google.cloud import firestore

import connectors
import firestore_client as fs
from connectors.base import ConnectorConfig

log = logging.getLogger("jobs.xml_sync")

CONNECTOR_ID = "jobfeed"


def run() -> None:
    for client_id, client in fs.iter_clients():
        if CONNECTOR_ID not in client.get("active_connectors", []):
            continue
        try:
            run_for_client(client_id, client)
        except Exception:  # en kund får inte fälla hela körningen
            log.exception("xml_sync failed for client %s", client_id)


def run_for_client(client_id: str, client: dict) -> None:
    job_feeds = (client.get("settings") or {}).get("job_feeds") or []
    if not job_feeds:
        return

    connector = connectors.get(CONNECTOR_ID)()
    config = ConnectorConfig(client_id=client_id, params={"job_feeds": job_feeds})
    items = connector.fetch(config)

    company_col = fs.raw_items_company_col(client_id)
    current: dict[str, dict] = {}
    for item in items:
        job_id = (item.extra or {}).get("job_id")
        if not job_id or not item.item_id:
            continue
        # merge=True bevarar LLM-berikningen (global_title/skills_enriched/strategic/
        # enriched_at) som job_enrichment skrivit på topp-nivå. closed_at=None nollställer
        # status: en annons som dykt upp igen i feeden räknas som aktiv igen.
        company_col.document(item.item_id).set(_payload(item), merge=True)
        current[job_id] = {"item_id": item.item_id, "name": (item.extra or {}).get("name")}

    _reconcile_closed(client_id, company_col, current)
    log.info("xml_sync %s: %d active jobs", client_id, len(current))

    # Berika nya annonser (ontologisk titel + filtrering, spec §2). Self-noop utan LLM.
    from services import job_enrichment

    job_enrichment.enrich_jobs_for_client(client_id)


def _reconcile_closed(client_id: str, company_col, current: dict[str, dict]) -> None:
    """Jämför dagens annons-id mot gårdagens; markera försvunna som stängda."""
    state_ref = fs.job_feed_state_doc(client_id)
    previous = (state_ref.get().to_dict() or {}).get("jobs", {})

    closed_ids = set(previous) - set(current)
    for job_id in closed_ids:
        item_id = (previous.get(job_id) or {}).get("item_id")
        if not item_id:
            continue
        company_col.document(item_id).set(
            {
                "closed_at": firestore.SERVER_TIMESTAMP,
                # Annonsen visas inte längre som sökbar (schema:JobPosting tas ur
                # output). Decay/Sunset av kompetenserna sköts i Slice 2.
                "included_in_output": False,
            },
            merge=True,
        )
    if closed_ids:
        log.info("xml_sync %s: %d jobs closed", client_id, len(closed_ids))

    state_ref.set({"jobs": current, "synced_at": firestore.SERVER_TIMESTAMP})


def _payload(item) -> dict:
    return {
        "source": item.source,
        "schema_type": item.schema_type,
        "content": item.content,
        "url": item.url,
        "published_at": item.published_at,
        "included_in_output": True,
        # En annons i dagens feed är aktiv → nollställ ev. tidigare stängning explicit
        # (merge=True skulle annars låta ett gammalt closed_at ligga kvar).
        "closed_at": None,
        "extra": item.extra,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
