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
        for employee_id, emp in fs.iter_employees(client_id):
            if emp.get("node_type") != "aktiv":
                continue
            for connector_id in active_connectors:
                try:
                    connector_cls = connectors.get(connector_id)
                except KeyError:
                    continue
                connector = connector_cls()
                items = connector.fetch(ConnectorConfig(client_id=client_id, employee_id=employee_id))
                for item in items:
                    fs.raw_items_col(client_id, employee_id).add(
                        {
                            "source": item.source,
                            "schema_type": item.schema_type,
                            "content": item.content,
                            "url": item.url,
                            "published_at": item.published_at,
                            "included_in_output": True,
                            **item.extra,
                        }
                    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
