"""Cloud Run Job: compile-schema.

Triggas event-drivet via Eventarc (Firestore write till raw_items/) eller
manuellt. Bygger JSON-LD-graf och laddar upp till GCS bakom Cloud CDN.

Change-agent-logiken (skipa upload om grafen är oförändrad) körs här.
"""
import argparse
import hashlib
import json
import logging
from datetime import datetime, timezone

from google.cloud import firestore, storage

import firestore_client as fs
from config import settings
from jobs._run_tracker import record_run
from schema_org import urls
from schema_org.compiler import compile_client
from schema_org.profile_page import render_llms_txt, render_profile_html

log = logging.getLogger("jobs.compile_schema")

# Hur många changelog-poster vi behåller per kund (kapad lista → obegränsad tillväxt undviks).
_HISTORY_CAP = 20

# Cache-policy för den färskhets-kritiska leveransytan (schema.json/index.html/llms.txt).
# `no-cache` = Cloud CDN revaliderar mot origin vid VARJE request i stället för att servera
# en cachad (potentiellt timmar gammal) kopia. Två syften: (1) crawlers får alltid den
# senast kompilerade sanningssidan — vi lovar "löpande uppdaterad" och dateModified är en
# citerbarhets-signal; (2) varje crawler-träff når origin och blir loggbar (crawl-health,
# P2). CDN är fortfarande PÅ (spik-/skala-väg kvar) — vi tillåter bara inte stale serving.
# Se diskussion om "mellanvägen": färskhet + mätbarhet väger tyngre än edge-cache vid
# nuvarande volym. robots.txt/sitemap.xml (compile_all_schemas) får cacha som förr.
PROFILE_CACHE_CONTROL = "no-cache"


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
        payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        profile_html = render_profile_html(client_id)
        llms_txt = render_llms_txt(client_id)

        if not settings.cdn_bucket:
            log.warning("CDN_BUCKET not configured — skipping upload")
            print(payload)
            r.summary = {"uploaded": False, "reason": "no_cdn_bucket"}
            return

        bucket = storage.Client().bucket(settings.cdn_bucket)
        schema_blob = bucket.blob(urls.schema_object(client_id))
        page_blob = bucket.blob(urls.page_object(client_id))
        llms_blob = bucket.blob(urls.llms_object(client_id))

        # Change-agent: hoppa över de dyra uppladdningarna BARA om ALLA tre serverade
        # artefakterna (JSON-LD + HTML + llms.txt) är oförändrade. Tidigare jämfördes
        # ENBART JSON-LD-grafen → en ren HTML-/mall-ändring (ny renderkod som inte rör
        # grafen, t.ex. A3:s org.nr-rad + medarbetarexpertis-sektion) re-uploadades
        # ALDRIG, så kodförändringar nådde inte den serverade sidan trots deploy +
        # recompile. Renderingen är deterministisk givet Firestore-staten, så detta
        # ger inga falska re-uploads. Firestore-metadatan (URL:erna) skrivs ändå alltid.
        unchanged = (
            schema_blob.exists() and schema_blob.download_as_text() == payload
            and page_blob.exists() and page_blob.download_as_text() == profile_html
            and llms_blob.exists() and llms_blob.download_as_text() == llms_txt
        )
        if unchanged:
            log.info("no change for %s — skipping upload, refreshing metadata only", client_id)
        else:
            schema_blob.upload_from_string(payload, content_type="application/ld+json")
            schema_blob.cache_control = PROFILE_CACHE_CONTROL
            schema_blob.patch()

            # Profilsidan (lager 2): statisk HTML bredvid schema.json, samma render-modell.
            page_blob.upload_from_string(profile_html, content_type="text/html; charset=utf-8")
            page_blob.cache_control = PROFILE_CACHE_CONTROL
            page_blob.patch()

            # llms.txt: markdown-summering för AI-crawlers (discoverability).
            llms_blob.upload_from_string(llms_txt, content_type="text/plain; charset=utf-8")
            llms_blob.cache_control = PROFILE_CACHE_CONTROL
            llms_blob.patch()

        # Versionering/changelog (P3): bumpa en monoton version + spara innehållshash +
        # en kapad ändringslogg BARA när grafen faktiskt ändrats — så "vilken version är
        # live och när ändrades den" är spårbart (och ger en rollback-referens).
        update: dict = {
            "cdn_url": urls.cdn_url(client_id),
            # served_url pekar i path-style-läge direkt på objektet (…/index.html),
            # eftersom GCS path-style inte serverar index.html för en katalog-URL. I
            # clean-läge (bakom LB med MainPageSuffix) blir det den rena …/<id>/-URL:en.
            "profile_url": urls.served_url(client_id),
            "last_compiled": firestore.SERVER_TIMESTAMP,
        }
        if not unchanged:
            prev = fs.client_doc(client_id).get().to_dict() or {}
            version = int(prev.get("compiled_version") or 0) + 1
            entry = {
                "version": version,
                "hash": payload_hash,
                "at": datetime.now(timezone.utc).isoformat(),
                "nodes": len(graph.get("@graph", [])),
            }
            history = (prev.get("compiled_history") or [])[-(_HISTORY_CAP - 1):] + [entry]
            update.update(compiled_version=version, compiled_hash=payload_hash, compiled_history=history)

        fs.client_doc(client_id).update(update)
        r.summary = {"uploaded": not unchanged, "version": update.get("compiled_version"),
                     "hash": payload_hash}

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
