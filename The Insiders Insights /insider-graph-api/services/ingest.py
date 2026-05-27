"""Onboarding-ingestion — kör alla ivalda connectors direkt när en kund skapas.

Normalt fyller cron-jobben på datan (scrape_active dagligen, scrape_website
veckovis). Vid onboarding vill vi att kunskapsgrafen ska vara befolkad från
första stund, så vi kör samma per-kund-logik direkt och kompilerar grafen.

Körs i en bakgrundstask (efter att onboarding-POST:en svarat), eftersom tunga
connectors kan ta minuter — website-crawlen besöker flera sidor. Att blockera
HTTP-anropet så länge är inte gångbart; bakgrundskörning ger "direkt vid
onboarding" utan timeout.

Mönstret (in-process BackgroundTasks för en kund i taget) speglar routers/jobs.py.
"""
from __future__ import annotations

import logging

import firestore_client as fs
from jobs import compile_schema, scrape_active, scrape_website
from services import claim_extraction

log = logging.getLogger(__name__)


def ingest_new_client(client_id: str) -> None:
    """Kör ivalda connectors för den nyss skapade kunden och kompilera grafen."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("ingest_new_client: klient %s saknas", client_id)
        return
    client = snap.to_dict() or {}

    try:
        scrape_active.run_for_client(client_id, client)
    except Exception:  # bakgrundstask: ett trasigt steg får inte tysta resten
        log.exception("ingest_new_client: scrape_active misslyckades för %s", client_id)

    if "website" in (client.get("active_connectors") or []):
        try:
            scrape_website.crawl_client(client_id, client, force=True)
        except Exception:
            log.exception("ingest_new_client: website-crawl misslyckades för %s", client_id)

    # Extrahera narrativa claims ur den nyss inhämtade fritexten (website-crawl m.m.)
    # FÖRE compile, annars projiceras de inte in i grafen förrän nästa körning.
    # No-op om ingen LLM är konfigurerad.
    try:
        claim_extraction.extract_claims_for_client(client_id)
    except Exception:
        log.exception("ingest_new_client: claim-extraktion misslyckades för %s", client_id)

    # Kompilera så property- + narrative-claims (inkl. GLEIF-koncernstruktur) syns direkt.
    try:
        compile_schema.run(client_id)
    except Exception:
        log.exception("ingest_new_client: compile misslyckades för %s", client_id)
