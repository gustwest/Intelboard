"""Cloud Run Job: scrape-active.

Triggas dagligen via Cloud Scheduler. Iterar alla kunder, kör connectors på
bolagsnivå (LinkedIn-företagssida, GLEIF, RSS, website, jobfeed) och skriver
RawItems till Firestore.

Per-medarbetare-skörd är borttagen — biografier om personer kommer numera in
via attesterad uppladdning (services/attested_ingest.py, source_type=people_bio).

    gcloud run jobs deploy scrape-active \\
      --image=.../insider-graph-api:latest \\
      --command python --args -m,jobs.scrape_active \\
      --region europe-north1
"""
import logging

import connectors
import firestore_client as fs
from connectors.base import ConnectorConfig
from jobs._run_tracker import record_run
from services.identity_enrichment import apply_identity_metadata

log = logging.getLogger("jobs.scrape_active")


def run() -> None:
    for client_id, client in fs.iter_clients():
        run_for_client(client_id, client)


def run_for_client(client_id: str, client: dict) -> None:
    """Kör bolagsnivå-connectors för EN kund.

    Anropas både av cron-loopen (run) och av onboarding-ingestionen
    (services/ingest) så att en ny kund fylls på direkt.
    """
    with record_run("scrape_active", client_id):
        active_connectors = client.get("active_connectors", [])
        _run_company_level(client_id, client, active_connectors)
        # GLEIF kan ha lyft fram org.nr — flytta upp till client_doc om manuell saknas.
        apply_identity_metadata(client_id)


def _run_company_level(client_id: str, client: dict, active: list[str]) -> None:
    """Connectors som körs en gång per kund (LinkedIn-företagssida, GLEIF, RSS)."""
    params = {
        "lei": client.get("lei"),
        "wikidata_id": client.get("wikidata_id"),
        "linkedin_url": client.get("company_linkedin_url"),
        "rss_feeds": (client.get("settings") or {}).get("rss_feeds") or [],
    }
    col = fs.raw_items_company_col(client_id)
    for connector_id in active:
        try:
            connector_cls = connectors.get(connector_id)
        except KeyError:
            continue
        connector = connector_cls()
        config = ConnectorConfig(client_id=client_id, params=params)
        for item in connector.fetch(config):
            # Idempotent persist när connectorn satt ett stabilt item_id (GLEIF, RSS,
            # jobfeed). Krävs för att task-retry i sharded fan-out ska kunna köra om en
            # kund utan att hopa dubbletter. Fallback till .add() finns kvar för
            # connectors utan stabilt id — då måste det jobbet köras med max-retries=0.
            if item.item_id:
                col.document(item.item_id).set(_payload(item))
            else:
                col.add(_payload(item))


def _payload(item) -> dict:
    return {
        "source": item.source,
        "schema_type": item.schema_type,
        "content": item.content,
        "url": item.url,
        "published_at": item.published_at,
        "included_in_output": True,
        # extra nestas (inte utplattat) — property-härledningen i
        # schema_org/claims.py läser raw["extra"]. Plattas den ut härleds inga
        # property-claims (GLEIF/LinkedIn).
        "extra": item.extra,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
