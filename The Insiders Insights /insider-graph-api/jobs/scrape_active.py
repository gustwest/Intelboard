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
from config import settings
from connectors.base import ConnectorConfig

log = logging.getLogger("jobs.scrape_active")


def run() -> None:
    for client_id, client in fs.iter_clients():
        run_for_client(client_id, client)


def run_for_client(client_id: str, client: dict) -> None:
    """Kör company- (och ev. employee-) connectors för EN kund.

    Anropas både av cron-loopen (run) och av onboarding-ingestionen
    (services/ingest) så att en ny kund fylls på direkt.
    """
    active_connectors = client.get("active_connectors", [])
    _run_company_level(client_id, client, active_connectors)

    # MVP: bara bolagsnivå. Per-medarbetare-profiler är avstängda by default.
    # Slås på antingen globalt (settings.scrape_employee_linkedin) eller per
    # kund (client.settings.scrape_employee_profiles). När det är på hämtas
    # bara medarbetare med node_type="aktiv" — så ledningen markeras "aktiv"
    # och övriga "passiv".
    if not _employee_linkedin_enabled(client):
        return
    for employee_id, emp in fs.iter_employees(client_id):
        if emp.get("node_type") != "aktiv":
            continue
        if emp.get("opted_out"):
            continue  # opt-out → hämta ingen ny data för personen
        _run_employee_level(client_id, employee_id, emp, active_connectors)


def _employee_linkedin_enabled(client: dict) -> bool:
    """Ska personprofiler scrapas för den här kunden?

    Per-kund-override vinner över global default. Sätt
    client.settings.scrape_employee_profiles = True för att kartlägga t.ex.
    ledningen hos ETT bolag utan att påverka övriga kunder.
    """
    override = (client.get("settings") or {}).get("scrape_employee_profiles")
    if override is not None:
        return bool(override)
    return settings.scrape_employee_linkedin


def _run_company_level(client_id: str, client: dict, active: list[str]) -> None:
    """Connectors som körs en gång per kund (LinkedIn-företagssida, GLEIF, RSS).

    employee_id är None här → LinkedIn-connectorn använder company-datasetet och
    hämtar bolagets sida, inte en personprofil.
    """
    params = {
        "lei": client.get("lei"),
        "linkedin_url": client.get("company_linkedin_url"),
        "rss_feeds": (client.get("settings") or {}).get("rss_feeds") or [],
    }
    for connector_id in active:
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
        # extra nestas (inte utplattat) — property-härledningen i
        # schema_org/claims.py läser raw["extra"]. Plattas den ut härleds inga
        # property-claims (GLEIF/LinkedIn).
        "extra": item.extra,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
