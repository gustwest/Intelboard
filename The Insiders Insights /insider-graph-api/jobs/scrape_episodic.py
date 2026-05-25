"""Cloud Run Job: scrape-episodic.

Triggas måndagar via Cloud Scheduler. Episodiska noder är aktiva med jämna
mellanrum — vi gör en lätt Google Alerts-sökning på personnamn och hämtar
LinkedIn-profilen.

Stub-form i MVP: iterar nodtyp=episodisk och anropar samma connectors som
scrape_active men markerar items som episodic-source.
"""
import logging

import connectors
import firestore_client as fs
from connectors.base import ConnectorConfig

log = logging.getLogger("jobs.scrape_episodic")


def run() -> None:
    for client_id, client in fs.iter_clients():
        active_connectors = client.get("active_connectors", [])
        for employee_id, emp in fs.iter_employees(client_id):
            if emp.get("node_type") != "episodisk":
                continue
            if emp.get("opted_out"):
                continue  # opt-out → hämta ingen ny data för personen
            for connector_id in active_connectors:
                if connector_id != "linkedin":
                    continue  # episodisk skörd = per-person; bara LinkedIn för MVP
                try:
                    connector_cls = connectors.get(connector_id)
                except KeyError:
                    continue
                connector = connector_cls()
                config = ConnectorConfig(
                    client_id=client_id,
                    employee_id=employee_id,
                    params={"linkedin_url": emp.get("linkedin_url")},
                )
                for item in connector.fetch(config):
                    fs.raw_items_col(client_id, employee_id).add(
                        {
                            "source": item.source,
                            "schema_type": item.schema_type,
                            "content": item.content,
                            "url": item.url,
                            "published_at": item.published_at,
                            "included_in_output": True,
                            "episodic": True,
                            **item.extra,
                        }
                    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
