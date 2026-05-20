"""Cloud Run Job: scrape-active.

Triggas dagligen via Cloud Scheduler. Iterar alla kunder, kör connectors
för aktiva noder, skriver RawItems till Firestore.

    gcloud run jobs deploy scrape-active \\
      --image=.../insider-graph-api:latest \\
      --command python --args -m,jobs.scrape_active \\
      --region europe-north1
"""
import logging

import connectors
import firestore_client as fs
from connectors.base import ConnectorConfig

log = logging.getLogger("jobs.scrape_active")


def run() -> None:
    for client_id, client in fs.iter_clients():
        active_connectors = client.get("active_connectors", [])
        _run_company_level(client_id, client, active_connectors)
        for employee_id, emp in fs.iter_employees(client_id):
            if emp.get("node_type") != "aktiv":
                continue
            _run_employee_level(client_id, employee_id, emp, active_connectors)


def _run_company_level(client_id: str, client: dict, active: list[str]) -> None:
    """Connectors som körs en gång per kund (Bolagsverket, RSS-feeds)."""
    params = {
        "org_number": client.get("org_number"),
        "rss_feeds": (client.get("settings") or {}).get("rss_feeds") or [],
    }
    for connector_id in active:
        if connector_id == "linkedin":
            continue  # företagsprofil hanteras via dedicated company employee
        try:
            connector_cls = connectors.get(connector_id)
        except KeyError:
            continue
        connector = connector_cls()
        config = ConnectorConfig(client_id=client_id, params=params)
        for item in connector.fetch(config):
            fs.client_doc(client_id).collection("raw_items_company").add(_payload(item))


def _run_employee_level(client_id: str, employee_id: str, emp: dict, active: list[str]) -> None:
    for connector_id in active:
        try:
            connector_cls = connectors.get(connector_id)
        except KeyError:
            continue
        if connector_id != "linkedin":
            continue  # per-medarbetare = bara LinkedIn för MVP
        connector = connector_cls()
        config = ConnectorConfig(
            client_id=client_id,
            employee_id=employee_id,
            params={"linkedin_url": emp.get("linkedin_url")},
        )
        for item in connector.fetch(config):
            fs.raw_items_col(client_id, employee_id).add(_payload(item))


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
