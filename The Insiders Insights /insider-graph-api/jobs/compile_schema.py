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
from jobs._run_tracker import record_run
from schema_org import urls
from schema_org.compiler import compile_client
from schema_org.profile_page import render_llms_txt, render_profile_html

log = logging.getLogger("jobs.compile_schema")


def run(client_id: str) -> None:
    with record_run("compile_schema", client_id) as r:
        # Output-kvalitets-gate: aktivt block/transform-läge på LinkedIn-demografi
        # (steg 4 i rollouten). Mutera berörda claims FÖRE compile_client så att den
        # ser den filtrerade staten. Andra connectors stannar i shadow mode (kallas
        # efter publicering nedan). Best-effort — får inte fälla leveransen.
        try:
            from services import output_quality_gate

            gate_summary = output_quality_gate.apply_gate(client_id)
            if gate_summary:
                r.summary["output_quality_gate"] = gate_summary
        except Exception as exc:  # noqa: BLE001
            log.warning("output_quality_gate failed for %s (non-fatal): %s", client_id, exc)

        graph = compile_client(client_id)
        payload = json.dumps(graph, ensure_ascii=False, default=str)
        profile_html = render_profile_html(client_id)
        llms_txt = render_llms_txt(client_id)

        if not settings.cdn_bucket:
            log.warning("CDN_BUCKET not configured — skipping upload")
            print(payload)
            r.summary = {"uploaded": False, "reason": "no_cdn_bucket"}
            return

        bucket = storage.Client().bucket(settings.cdn_bucket)
        schema_blob = bucket.blob(urls.schema_object(client_id))

        # Change-agent: hoppa över de dyra uppladdningarna om grafen är oförändrad.
        # Firestore-metadatan (URL:erna) skrivs ändå alltid — den är idempotent och
        # billig, och måste få spegla nuvarande URL-form även när grafen inte ändrats
        # (annars sitter äldre kunder kvar på en tidigare URL tills grafen råkar ändras).
        unchanged = schema_blob.exists() and schema_blob.download_as_text() == payload
        if unchanged:
            log.info("no change for %s — skipping upload, refreshing metadata only", client_id)
        else:
            schema_blob.upload_from_string(payload, content_type="application/ld+json")
            schema_blob.cache_control = "public, max-age=300"
            schema_blob.patch()

            # Profilsidan (lager 2): statisk HTML bredvid schema.json, samma render-modell.
            page_blob = bucket.blob(urls.page_object(client_id))
            page_blob.upload_from_string(profile_html, content_type="text/html; charset=utf-8")
            page_blob.cache_control = "public, max-age=300"
            page_blob.patch()

            # llms.txt: markdown-summering för AI-crawlers (discoverability).
            llms_blob = bucket.blob(urls.llms_object(client_id))
            llms_blob.upload_from_string(llms_txt, content_type="text/plain; charset=utf-8")
            llms_blob.cache_control = "public, max-age=300"
            llms_blob.patch()

        fs.client_doc(client_id).update(
            {
                "cdn_url": urls.cdn_url(client_id),
                # served_url pekar i path-style-läge direkt på objektet (…/index.html),
                # eftersom GCS path-style inte serverar index.html för en katalog-URL. I
                # clean-läge (bakom LB med MainPageSuffix) blir det den rena …/<id>/-URL:en.
                "profile_url": urls.served_url(client_id),
                "last_compiled": firestore.SERVER_TIMESTAMP,
            }
        )
        r.summary = {"uploaded": not unchanged}

        # Change-agent: håll Förtroendegap-tillståndet färskt i samma loop (spec §8, kadens).
        # Best-effort — får aldrig fälla schema-kompileringen.
        try:
            from jobs import compute_trust_gap

            compute_trust_gap.run(client_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("compute_trust_gap failed for %s (non-fatal): %s", client_id, exc)

        # Output-kvalitets-rubric i SHADOW MODE: scorea de claims som faktiskt
        # publicerats, logga resultatet. Påverkar ALDRIG denna leverans — det här är
        # diagnos-loggen som driver promotion-beslut till active gate (steg 4 + 5).
        # Best-effort, samma sköld som compute_trust_gap ovan.
        try:
            from services import output_quality_shadow

            shadow_summary = output_quality_shadow.run_shadow(client_id, source="compile_schema")
            if shadow_summary:
                r.summary["output_quality"] = shadow_summary
        except Exception as exc:  # noqa: BLE001
            log.warning("output_quality_shadow failed for %s (non-fatal): %s", client_id, exc)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    run(args.client_id)
