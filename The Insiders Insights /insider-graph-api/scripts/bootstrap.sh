#!/usr/bin/env bash
#
# Engångs-bootstrap för Insider Graph på Google Cloud.
#
# Skapar:
#   - Artifact Registry-repo för images
#   - GCS-bucket för JSON-LD (CDN-origin)
#   - Service-account för insider-graph-api
#   - IAM-bindningar (Firestore, GCS, Secret Manager)
#   - Cloud Run Jobs (scrape-active, scrape-website, extract-all-claims,
#     compile-all-schemas, polling-weekly, xml-sync, sunset-skills, quarterly-linkedin-todo,
#     compute-trust-gap, trust-gap-report, warmth-probes, risk-detect-all, monthly-report-all,
#     customer-report-email-all)
#   - Cloud Scheduler-triggers för jobben
#   - Eventarc-trigger för compile_schema vid Firestore-skrivningar
#
# Förutsätter att secrets redan finns i Secret Manager. Saknade secrets listas
# i README.md sektion "Secrets".
#
# Kör en gång efter clone, sedan styr cloudbuild.yaml fortsatta deploys.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-europe-north1}"
# EU-region för Vertex AI (våra resonemangsmodeller, EU-only). europe-west1 har både
# Gemini och Claude på Vertex. OBS: Claude måste aktiveras i Vertex Model Garden (engångs),
# och VALIDATOR_MODEL/GENERATOR_MODEL måste sättas till giltiga Vertex-modell-id.
VERTEX_LOCATION="${VERTEX_LOCATION:-europe-west1}"
# Cloud Scheduler är inte tillgängligt i europe-north1 — vi lägger schemaläggarna i europe-west1.
SCHEDULER_LOCATION="${SCHEDULER_LOCATION:-europe-west1}"
SERVICE="insider-graph-api"
SA_NAME="insider-graph-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="${CDN_BUCKET:-insider-graph-cdn-${PROJECT_ID}}"
# Backup-bucket för schemalagd Firestore-export. Privat (no allUsers), egen
# multi-region för läs-säkerhet vid disaster. Lifecycle-policy nedan håller bara
# de N senaste exporterna kvar (default 8 veckor).
BACKUP_BUCKET="${BACKUP_BUCKET:-insider-graph-backups-${PROJECT_ID}}"
BACKUP_LOCATION="${BACKUP_LOCATION:-EU}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-60}"
REPO="insider-graph-repo"
IMAGE="europe-north1-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"
# Uptime-check + alert: kräver att Cloud Run-tjänsten kan nås publikt på /health
# (allow-unauthenticated finns redan). NOTIFY_EMAIL får alert-mejl; lämna tom för
# att hoppa över alert-policyn (uptime-checken kan ändå skapas).
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

# Origin-URL som compile-schema sätter på profilsidan/schema.json. Default är den råa
# GCS path-style-URL:en (fungerar direkt, ingen LB krävs). Vid clean-URL-cutover:
# kör om med CDN_BASE_URL=https://${PROFILE_DOMAIN} EFTER att DNS pekar på LB-IP:t och
# certet är ACTIVE (se docs/clean-url-cutover.md). En enda variabel flyttar allt.
CDN_BASE_URL="${CDN_BASE_URL:-https://storage.googleapis.com/${BUCKET}}"
# Clean-URL-läge (rena katalog-URL:er, innehåll utan clients/-prefix). Sätts true
# vid cutover, tillsammans med CDN_BASE_URL → egen domän. Default false = path-style.
CDN_CLEAN_URLS="${CDN_CLEAN_URLS:-false}"

# Utgående mejl (Brevo, EU). NOTIFY_FROM_EMAIL = verifierad avsändare i Brevo, krävs
# för att B1/B2-kundmejlen ska skicka (annars self-no-op). OPS_NOTIFY_EMAIL = internt
# mottagar-team för kvartals-påminnelsen (tom = den no-op:ar). Sätts som env (ej secret)
# på BÅDE service och jobb — annars raderas de av --set-env-vars vid omkörning.
NOTIFY_FROM_EMAIL="${NOTIFY_FROM_EMAIL:-noreply@geogiraph.com}"
OPS_NOTIFY_EMAIL="${OPS_NOTIFY_EMAIL:-}"

# Egen domän för profilsidorna (clean-URL via HTTPS-LB + Cloud CDN). LB-sektionen
# nedan provisioneras bara om PROFILE_DOMAIN är satt. Lämna tom för att hoppa över.
PROFILE_DOMAIN="${PROFILE_DOMAIN:-}"
LB_IP_NAME="insider-graph-cdn-ip"
LB_BACKEND="insider-graph-cdn-backend"
LB_URLMAP="insider-graph-cdn-urlmap"
LB_CERT="insider-graph-cdn-cert"
LB_PROXY="insider-graph-cdn-proxy"
LB_FRULE="insider-graph-cdn-fr"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID är inte satt (gcloud config get-value project)" >&2
  exit 1
fi

echo "==> Project: $PROJECT_ID  Region: $REGION  Bucket: $BUCKET"

# ---- 1. Aktivera APIs ------------------------------------------------------
echo "==> Aktiverar APIs"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  eventarc.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  monitoring.googleapis.com \
  pubsub.googleapis.com \
  --project="$PROJECT_ID"

# ---- 2. Artifact Registry --------------------------------------------------
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Skapar Artifact Registry-repo: $REPO"
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID"
fi

# ---- 3. GCS-bucket bakom Cloud CDN ----------------------------------------
if ! gsutil ls -b "gs://$BUCKET" >/dev/null 2>&1; then
  echo "==> Skapar GCS-bucket: gs://$BUCKET"
  gsutil mb -l "$REGION" -p "$PROJECT_ID" "gs://$BUCKET"
fi
echo "==> Sätter publik läsåtkomst på bucketen"
gsutil iam ch allUsers:objectViewer "gs://$BUCKET" || true
cat <<'JSON' > cors.json
[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type"],"maxAgeSeconds":300}]
JSON
gsutil cors set cors.json "gs://$BUCKET"
rm cors.json

# ---- 3a. GCS-bucket för Firestore-backuper (privat, retention via lifecycle) ----
if ! gsutil ls -b "gs://$BACKUP_BUCKET" >/dev/null 2>&1; then
  echo "==> Skapar backup-bucket: gs://$BACKUP_BUCKET ($BACKUP_LOCATION)"
  gsutil mb -l "$BACKUP_LOCATION" -p "$PROJECT_ID" "gs://$BACKUP_BUCKET"
fi
# Lifecycle: radera exportkataloger äldre än BACKUP_RETENTION_DAYS. Skyddar
# disaster-recovery-fönstret men hindrar bucket från att växa obegränsat.
cat > lifecycle.json <<JSON
{"lifecycle":{"rule":[{"action":{"type":"Delete"},"condition":{"age":${BACKUP_RETENTION_DAYS}}}]}}
JSON
gsutil lifecycle set lifecycle.json "gs://$BACKUP_BUCKET"
rm lifecycle.json

# ---- 3b. Clean-URL: HTTPS-LB + Cloud CDN på egen domän --------------------
# Provisioneras bara om PROFILE_DOMAIN är satt. Ger snygga, migrations-säkra
# profil-URL:er (https://$PROFILE_DOMAIN/clients/<id>/) i stället för den råa
# storage.googleapis.com-adressen, och låter MainPageSuffix servera index.html
# för katalog-URL:er. Allt här är idempotent (describe-före-create).
#
# OBS: detta sätter BARA upp infran. CDN_BASE_URL flippas INTE automatiskt —
# se docs/clean-url-cutover.md för den ordnade övergången (DNS → cert ACTIVE →
# flippa CDN_BASE_URL → redeploy → recompile).
if [[ -n "$PROFILE_DOMAIN" ]]; then
  echo "==> Clean-URL: sätter upp HTTPS-LB + CDN för $PROFILE_DOMAIN"
  gcloud services enable compute.googleapis.com --project="$PROJECT_ID"

  # MainPageSuffix: katalog-URL (…/clients/<id>/) serverar index.html bakom LB:n.
  gsutil web set -m index.html "gs://$BUCKET"

  # Global statisk anycast-IP (det DNS:en ska peka på).
  if ! gcloud compute addresses describe "$LB_IP_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Reserverar global statisk IP: $LB_IP_NAME"
    gcloud compute addresses create "$LB_IP_NAME" --global --project="$PROJECT_ID"
  fi
  LB_IP="$(gcloud compute addresses describe "$LB_IP_NAME" --global --project="$PROJECT_ID" --format='value(address)')"

  # Backend-bucket med Cloud CDN aktiverat.
  if ! gcloud compute backend-buckets describe "$LB_BACKEND" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Skapar backend-bucket (CDN): $LB_BACKEND"
    gcloud compute backend-buckets create "$LB_BACKEND" \
      --gcs-bucket-name="$BUCKET" --enable-cdn --project="$PROJECT_ID"
  fi

  # URL-map → backend-bucket.
  if ! gcloud compute url-maps describe "$LB_URLMAP" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Skapar URL-map: $LB_URLMAP"
    gcloud compute url-maps create "$LB_URLMAP" \
      --default-backend-bucket="$LB_BACKEND" --project="$PROJECT_ID"
  fi

  # Google-managed SSL-cert. Blir ACTIVE först när DNS för $PROFILE_DOMAIN pekar på LB_IP.
  if ! gcloud compute ssl-certificates describe "$LB_CERT" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Skapar managed SSL-cert: $LB_CERT ($PROFILE_DOMAIN)"
    gcloud compute ssl-certificates create "$LB_CERT" \
      --domains="$PROFILE_DOMAIN" --global --project="$PROJECT_ID"
  fi

  # Target HTTPS-proxy.
  if ! gcloud compute target-https-proxies describe "$LB_PROXY" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Skapar target HTTPS-proxy: $LB_PROXY"
    gcloud compute target-https-proxies create "$LB_PROXY" \
      --url-map="$LB_URLMAP" --ssl-certificates="$LB_CERT" --global --project="$PROJECT_ID"
  fi

  # Global forwarding-rule (443) → proxy, på den reserverade IP:n.
  if ! gcloud compute forwarding-rules describe "$LB_FRULE" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Skapar forwarding-rule (443): $LB_FRULE"
    gcloud compute forwarding-rules create "$LB_FRULE" \
      --global --target-https-proxy="$LB_PROXY" --ports=443 \
      --address="$LB_IP_NAME" --project="$PROJECT_ID"
  fi

  echo
  echo "==> LB klar. Peka DNS innan certet kan bli ACTIVE:"
  echo "    $PROFILE_DOMAIN   A   $LB_IP"
  echo "    Följ cert-status:  gcloud compute ssl-certificates describe $LB_CERT --global --format='value(managed.status)'"
  echo "    När ACTIVE: se docs/clean-url-cutover.md för att flippa CDN_BASE_URL."
  echo
fi

# ---- 4. Service account + IAM ---------------------------------------------
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Skapar service-account: $SA_EMAIL"
  gcloud iam service-accounts create "$SA_NAME" --project="$PROJECT_ID" \
    --display-name="Insider Graph API"
fi

echo "==> Tilldelar IAM-roller till $SA_EMAIL"
for ROLE in \
  roles/datastore.user \
  roles/datastore.importExportAdmin \
  roles/storage.objectAdmin \
  roles/secretmanager.secretAccessor \
  roles/run.invoker \
  roles/aiplatform.user \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role="$ROLE" --condition=None >/dev/null
done

# ---- 5. Cloud Run-service (env + sekreter) --------------------------------
# Servicen är redan deployad första gången via cloudbuild. Här uppdaterar vi
# bara env-variabler och secret-bindningar — kör det här om secrets ändras.
echo "==> Uppdaterar service-env för $SERVICE"
# OPS_WEBHOOK_TOKEN: verifieringen mot Pub/Sub ops-alerts-webhooken. Tom = webhook
# avvisar alla anrop (säker default). Sätt env-varen innan körning och kör om.
OPS_WEBHOOK_TOKEN_ENV="${OPS_WEBHOOK_TOKEN:-}"
gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT_ID" \
  --service-account="$SA_EMAIL" \
  --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},CDN_BUCKET=${BUCKET},CDN_BASE_URL=${CDN_BASE_URL},CDN_CLEAN_URLS=${CDN_CLEAN_URLS},OPS_WEBHOOK_TOKEN=${OPS_WEBHOOK_TOKEN_ENV},NOTIFY_FROM_EMAIL=${NOTIFY_FROM_EMAIL},OPS_NOTIFY_EMAIL=${OPS_NOTIFY_EMAIL}" \
  --update-secrets="OPENAI_API_KEY=insider-graph-openai-api-key:latest,GEMINI_API_KEY=insider-graph-gemini-api-key:latest,PERPLEXITY_API_KEY=insider-graph-perplexity-api-key:latest,ANTHROPIC_API_KEY=insider-graph-anthropic-api-key:latest,BREVO_API_KEY=insider-graph-brevo-api-key:latest,ADMIN_API_KEY=insider-graph-admin-api-key:latest" \
  || echo "==> Service finns ej ännu — kör cloudbuild först"

# ---- 6. Cloud Run Jobs -----------------------------------------------------
# create_or_update_job NAME CMD [TASKS] [PARALLELISM] [TASK_TIMEOUT]
#   TASKS/PARALLELISM: sharded fan-out när >1. Varje task läser
#     CLOUD_RUN_TASK_INDEX/COUNT och tar 1/N av kunderna (fs.iter_client_ids_shard).
#     Förutsätter att jobbet är idempotent — alla fan-out-jobb är granskade
#     (deterministiska doc-IDs / set över .add).
#   TASK_TIMEOUT: per-task timeout. Default 600s (Cloud Runs default) räcker till
#     korta jobb. LLM-tunga jobb höjs explicit nedan så de inte trunkeras.
create_or_update_job() {
  local NAME="$1"
  local CMD="$2"
  local TASKS="${3:-1}"
  local PARALLELISM="${4:-1}"
  local TASK_TIMEOUT="${5:-600s}"
  if gcloud run jobs describe "$NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Uppdaterar job: $NAME (tasks=$TASKS parallelism=$PARALLELISM timeout=$TASK_TIMEOUT)"
    gcloud run jobs update "$NAME" \
      --image="$IMAGE" --region="$REGION" --project="$PROJECT_ID" \
      --service-account="$SA_EMAIL" \
      --command="python" --args="-m,$CMD" \
      --tasks="$TASKS" --parallelism="$PARALLELISM" --task-timeout="$TASK_TIMEOUT" \
      --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},CDN_BUCKET=${BUCKET},CDN_BASE_URL=${CDN_BASE_URL},CDN_CLEAN_URLS=${CDN_CLEAN_URLS},NOTIFY_FROM_EMAIL=${NOTIFY_FROM_EMAIL},OPS_NOTIFY_EMAIL=${OPS_NOTIFY_EMAIL}" \
      --update-secrets="OPENAI_API_KEY=insider-graph-openai-api-key:latest,GEMINI_API_KEY=insider-graph-gemini-api-key:latest,PERPLEXITY_API_KEY=insider-graph-perplexity-api-key:latest,ANTHROPIC_API_KEY=insider-graph-anthropic-api-key:latest,BREVO_API_KEY=insider-graph-brevo-api-key:latest,ADMIN_API_KEY=insider-graph-admin-api-key:latest"
  else
    echo "==> Skapar job: $NAME (tasks=$TASKS parallelism=$PARALLELISM timeout=$TASK_TIMEOUT)"
    gcloud run jobs create "$NAME" \
      --image="$IMAGE" --region="$REGION" --project="$PROJECT_ID" \
      --service-account="$SA_EMAIL" \
      --command="python" --args="-m,$CMD" \
      --tasks="$TASKS" --parallelism="$PARALLELISM" --task-timeout="$TASK_TIMEOUT" \
      --max-retries=1 \
      --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},CDN_BUCKET=${BUCKET},CDN_BASE_URL=${CDN_BASE_URL},CDN_CLEAN_URLS=${CDN_CLEAN_URLS},NOTIFY_FROM_EMAIL=${NOTIFY_FROM_EMAIL},OPS_NOTIFY_EMAIL=${OPS_NOTIFY_EMAIL}" \
      --set-secrets="OPENAI_API_KEY=insider-graph-openai-api-key:latest,GEMINI_API_KEY=insider-graph-gemini-api-key:latest,PERPLEXITY_API_KEY=insider-graph-perplexity-api-key:latest,ANTHROPIC_API_KEY=insider-graph-anthropic-api-key:latest,BREVO_API_KEY=insider-graph-brevo-api-key:latest,ADMIN_API_KEY=insider-graph-admin-api-key:latest"
  fi
}

# Lätta/snabba jobb — seriellt (1 task) räcker även vid 100 kunder. Höjd timeout
# på extract-all-claims och polling-weekly för säkerhetsmarginal vid 50 kunder.
create_or_update_job scrape-active           jobs.scrape_active            1 1 1800s
create_or_update_job scrape-website          jobs.scrape_website           1 1 1800s
create_or_update_job extract-all-claims      jobs.extract_all_claims       1 1 1800s
create_or_update_job compile-all-schemas     jobs.compile_all_schemas      1 1 1800s
create_or_update_job polling-weekly          jobs.polling_weekly           1 1 1800s
create_or_update_job xml-sync                jobs.xml_sync                 1 1 1800s
create_or_update_job sunset-skills           jobs.sunset_skills            1 1 600s
create_or_update_job quarterly-linkedin-todo jobs.quarterly_todo           1 1 600s
# Humaniseringslager & Förtroendegap (docs/humanization-trust-gap-spec.md):
create_or_update_job compute-trust-gap        jobs.compute_trust_gap       1 1 1800s
create_or_update_job trust-gap-report         jobs.trust_gap_report        1 1 600s
# GEO-riskloopen (sharded fan-out): risk-detect och warmth-probes är de tyngsta
# LLM-jobben. Vid 50 kunder × ~5 min/kund seriellt = ~4h → trunkeras. tasks=5
# parallelism=5 → ~50 min/körning. Höj TASKS/PARALLELISM när kundantalet växer
# (justera mot LLM rate limits — ej linjär skalning).
create_or_update_job warmth-probes            jobs.warmth_probes           5 5 3600s
create_or_update_job risk-detect-all          jobs.risk_detect_all         5 5 3600s
create_or_update_job monthly-report-all       jobs.monthly_report_all      1 1 1800s
# Spår B2: kund-säkert månadsmejl till varje kunds kontakt (self-no-op utan
# Brevo-konfig/kontakt). Körs efter monthly-report-all så rapporten finns.
create_or_update_job customer-report-email-all jobs.customer_report_email_all 1 1 1800s
# Modell-drift: greppar repot + jämför services/model_registry mot latest_known.
# Lätt jobb (ren IO + ett par regex-pass) → seriellt + kort timeout.
create_or_update_job model-drift-scan         jobs.model_drift_scan        1 1 600s
# Modell-tillgänglighet: dagligt smoke-test mot varje LIVE modell (1 trivial
# .invoke() per entry) — fångar regions-glapp, ToS-brist och kvotfel.
create_or_update_job model-availability-check jobs.model_availability_check 1 1 600s
# Kostnads-roll-up: läser föregående dygns job_runs.summary.tokens, summerar
# USD per modell/kund/jobb-typ, kollar trösklar. Lätt jobb — Firestore-läsning + lite mattematik.
create_or_update_job cost-rollup              jobs.cost_rollup              1 1 600s
# C2 språkexperiment (docs/leverans-arbetsplan.md §C2): ad-hoc per kund — INGEN
# scheduler. Triggas manuellt med args-override:
#   gcloud run jobs execute lang-probe --region=$REGION \
#     --args="-m,jobs.lang_probe,--client-id,<id>" --wait
# LLM-tungt (probe-anrop × sv/en × runs) → höjd timeout.
create_or_update_job lang-probe               jobs.lang_probe               1 1 1800s

# ---- 7. Cloud Scheduler-triggers ------------------------------------------
schedule_job() {
  local NAME="$1"; local CRON="$2"; local TARGET_JOB="$3"
  local URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${TARGET_JOB}:run"
  if gcloud scheduler jobs describe "$NAME" --location="$SCHEDULER_LOCATION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Uppdaterar scheduler: $NAME"
    gcloud scheduler jobs update http "$NAME" \
      --location="$SCHEDULER_LOCATION" --project="$PROJECT_ID" \
      --schedule="$CRON" --time-zone="Europe/Stockholm" \
      --uri="$URI" --http-method=POST \
      --oauth-service-account-email="$SA_EMAIL"
  else
    echo "==> Skapar scheduler: $NAME"
    gcloud scheduler jobs create http "$NAME" \
      --location="$SCHEDULER_LOCATION" --project="$PROJECT_ID" \
      --schedule="$CRON" --time-zone="Europe/Stockholm" \
      --uri="$URI" --http-method=POST \
      --oauth-service-account-email="$SA_EMAIL"
  fi
}

# Pipelinens dagliga ordning: inhämtning → claim-extraktion → compile.
# scrape-website måndagar 03:45 (veckovis crawl, cadence-guard skyddar mot oftare),
# scrape-active dagligen 04:00, extract-all-claims dagligen 04:45 (efter inhämtning,
# FÖRE compile så dagens claims kommer med), compile-all dagligen 05:00,
# polling tisdagar 06:00.
schedule_job scrape-website-weekly   "45 3 * * 1" scrape-website
schedule_job scrape-active-daily     "0 4 * * *"  scrape-active
schedule_job extract-all-claims-daily "45 4 * * *" extract-all-claims
schedule_job compile-all-daily       "0 5 * * *"  compile-all-schemas
schedule_job polling-weekly-tue      "0 6 * * 2"  polling-weekly
# Jobfeed-pipelinen: xml-sync dagligen 03:30 (före compile-all så stängningar hinner
# slå igenom), sunset-skills måndagar 02:00, kvartals-To-Do-check dagligen 07:00
# (idempotent — skapar bara To-Do när det gått ~90 dagar).
schedule_job xml-sync-daily          "30 3 * * *" xml-sync
schedule_job sunset-skills-weekly    "0 2 * * 1"  sunset-skills
schedule_job quarterly-todo-daily    "0 7 * * *"  quarterly-linkedin-todo
# Humaniseringslagret: värme-probes tisdagar 06:30 (efter polling — kostar motoranrop;
# perceptions-TAL visas ej skarpt för kund förrän kalibrering är låst). compute-trust-gap
# dagligt golv 05:15 (change-agenten i compile_schema täcker annars per kund). trust-gap-
# report månadsvis snapshot 1:a kl 08:00.
schedule_job warmth-probes-weekly     "30 6 * * 2"  warmth-probes
schedule_job compute-trust-gap-daily  "15 5 * * *"  compute-trust-gap
schedule_job trust-gap-report-monthly "0 8 1 * *"   trust-gap-report
# GEO-riskloopen: risk-detect tisdagar 07:00 (efter polling 06:00 + warmth-probes 06:30 —
# kör godkända frågor mot motorerna, fångar drift veckovis). Månadsrapporten 1:a 07:00
# (efter månadens sista veckovisa risk-detect, så snapshotet speglar färska findings).
schedule_job risk-detect-weekly-tue   "0 7 * * 2"   risk-detect-all
schedule_job monthly-report-monthly   "0 7 1 * *"   monthly-report-all
# Kund-mejlet 1:a kl 07:30 — efter att månadsrapporterna byggts (07:00) så underlaget finns.
schedule_job customer-report-email-monthly "30 7 1 * *" customer-report-email-all
# Modell-drift veckovis måndagar 02:30 — innan resten av pipen drar igång, så
# inboxen är färsk när dagen börjar. Mild policy: bara flagga, aldrig blockera.
schedule_job model-drift-weekly       "30 2 * * 1"  model-drift-scan
# Tillgänglighet dagligen 02:00 — innan drift-scan så ev. unavailable + behind_latest
# visas tillsammans i inboxen vid morgonkollen.
schedule_job model-availability-daily "0 2 * * *"   model-availability-check
# Kostnads-rollup dagligen 02:15 — efter availability men före risk-detect/scrape så
# gårdagens job_runs är klara att summera. Skapar cost_summary/{YYYY-MM-DD} +
# triggar tröskel-alerts som hamnar i drift-larmen.
schedule_job cost-rollup-daily        "15 2 * * *"  cost-rollup

# ---- 7b. Firestore TTL-policy på job_runs.expire_at -----------------------
# Koden i jobs/_run_tracker.py skriver ett `expire_at`-fält ~90 dagar i framtiden.
# TTL-policyn nedan låter Firestore radera dokumenten automatiskt — utan den
# växer collection:en obegränsat (10k+ dokument/månad vid 50 kunder).
echo "==> Aktiverar TTL-policy på job_runs.expire_at"
gcloud firestore fields ttls update expire_at \
  --collection-group=job_runs --enable-ttl \
  --project="$PROJECT_ID" --async \
  || echo "==> TTL kunde inte aktiveras (kan vara redan aktiv) — verifiera i konsolen"

# ---- 7c. Point-in-time recovery (7-dagars rullande fönster) ---------------
# Gratis upp till 7 dagar. Räcker för att kunna återställa enstaka kunds data
# efter ett buggigt jobb eller en felaktig manuell radering.
echo "==> Aktiverar PITR på Firestore-databasen"
gcloud firestore databases update \
  --database="(default)" --enable-pitr \
  --project="$PROJECT_ID" \
  || echo "==> PITR kunde inte aktiveras (redan på eller fel CLI-version) — verifiera"

# ---- 7d. Schemalagd Firestore-export till backup-bucket -------------------
# Cloud Scheduler → Firestore Admin API (exportDocuments). SA behöver
# datastore.importExportAdmin (tilldelas i §4). Veckovis söndag 03:00.
EXPORT_NAME="firestore-export-weekly"
EXPORT_URI="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments"
EXPORT_BODY='{"outputUriPrefix":"gs://'${BACKUP_BUCKET}'/firestore"}'
if gcloud scheduler jobs describe "$EXPORT_NAME" --location="$SCHEDULER_LOCATION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Uppdaterar scheduler: $EXPORT_NAME"
  gcloud scheduler jobs update http "$EXPORT_NAME" \
    --location="$SCHEDULER_LOCATION" --project="$PROJECT_ID" \
    --schedule="0 3 * * 0" --time-zone="Europe/Stockholm" \
    --uri="$EXPORT_URI" --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body="$EXPORT_BODY" \
    --oauth-service-account-email="$SA_EMAIL"
else
  echo "==> Skapar scheduler: $EXPORT_NAME"
  gcloud scheduler jobs create http "$EXPORT_NAME" \
    --location="$SCHEDULER_LOCATION" --project="$PROJECT_ID" \
    --schedule="0 3 * * 0" --time-zone="Europe/Stockholm" \
    --uri="$EXPORT_URI" --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body="$EXPORT_BODY" \
    --oauth-service-account-email="$SA_EMAIL"
fi

# ---- 7e. Uptime check + alert policy --------------------------------------
# /health (routers/health.py) returnerar 200 OK. Uptime-checken kör var 5:e minut
# från 6 globala regioner; alert-policyn larmar efter två misslyckade checks.
SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(status.url)' 2>/dev/null || true)"
SERVICE_HOST="${SERVICE_URL#https://}"
if [[ -n "$SERVICE_HOST" ]]; then
  UPTIME_NAME="insider-graph-api-up"
  echo "==> Skapar/uppdaterar uptime-check: $UPTIME_NAME mot https://${SERVICE_HOST}/health"
  if ! gcloud monitoring uptime describe "$UPTIME_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud monitoring uptime create "$UPTIME_NAME" \
      --resource-type=uptime-url \
      --resource-labels="host=${SERVICE_HOST},project_id=${PROJECT_ID}" \
      --protocol=https \
      --path=/health \
      --period=5 \
      --timeout=10 \
      --project="$PROJECT_ID" \
      || echo "==> Uptime-checken kunde inte skapas automatiskt — skapa manuellt mot https://${SERVICE_HOST}/health"
  fi

  if [[ -n "$NOTIFY_EMAIL" ]]; then
    echo "==> Säkerställer email notification channel ($NOTIFY_EMAIL)"
    CHANNEL_ID="$(gcloud beta monitoring channels list \
      --filter="type=email AND labels.email_address=${NOTIFY_EMAIL}" \
      --format='value(name)' --project="$PROJECT_ID" 2>/dev/null | head -n1 || true)"
    if [[ -z "$CHANNEL_ID" ]]; then
      CHANNEL_ID="$(gcloud beta monitoring channels create \
        --display-name="Insider Graph ops" \
        --type=email \
        --channel-labels="email_address=${NOTIFY_EMAIL}" \
        --format='value(name)' --project="$PROJECT_ID" 2>/dev/null || true)"
    fi
    if [[ -n "$CHANNEL_ID" ]]; then
      echo "==> Alert-policy bör peka på $CHANNEL_ID — verifiera i konsolen (Monitoring > Alerting)"
      echo "    Skapa policy: 'Uptime check failed' på resource=$UPTIME_NAME → notify $CHANNEL_ID"
    fi
  else
    echo "==> NOTIFY_EMAIL ej satt — hoppar över alert-policy. Sätt NOTIFY_EMAIL=... och kör om."
  fi
else
  echo "==> Kunde inte hämta service-URL — uptime-check skippas. Deploya servicen först."
fi

# ---- 7f. Pub/Sub-topic + push-subscription för ops-alerts -----------------
# Cloud Billing budget-alerts publiceras till ett Pub/Sub-topic; push-subscriptionen
# vidarebefordrar dem till /api/webhooks/ops-alerts som skapar en ops-alert.
# Authentisering: query-param ?token=$OPS_WEBHOOK_TOKEN — SÄTT detta env-värde
# innan du kör scriptet (eller efter; subscriptionen accepterar update).
TOPIC_NAME="ops-budget-alerts"
SUB_NAME="ops-budget-alerts-push"
if ! gcloud pubsub topics describe "$TOPIC_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Skapar Pub/Sub-topic: $TOPIC_NAME"
  gcloud pubsub topics create "$TOPIC_NAME" --project="$PROJECT_ID"
fi
if [[ -n "${SERVICE_URL:-}" && -n "${OPS_WEBHOOK_TOKEN:-}" ]]; then
  PUSH_URL="${SERVICE_URL}/api/webhooks/ops-alerts?token=${OPS_WEBHOOK_TOKEN}"
  if gcloud pubsub subscriptions describe "$SUB_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Uppdaterar Pub/Sub-subscription: $SUB_NAME"
    gcloud pubsub subscriptions update "$SUB_NAME" \
      --push-endpoint="$PUSH_URL" \
      --project="$PROJECT_ID" || true
  else
    echo "==> Skapar Pub/Sub-subscription: $SUB_NAME → $PUSH_URL"
    gcloud pubsub subscriptions create "$SUB_NAME" \
      --topic="$TOPIC_NAME" \
      --push-endpoint="$PUSH_URL" \
      --project="$PROJECT_ID"
  fi
  echo
  echo "==> NÄSTA: koppla topic till Billing budget."
  echo "    Konsol → Billing → Budgets → välj budget → 'Manage notifications' → "
  echo "    Connect a Pub/Sub topic → välj '$TOPIC_NAME'."
  echo "    Trösklar 50/80/100 + forecasted 100 publicerar då här."
else
  echo "==> Hoppar över Pub/Sub-subscription (SERVICE_URL eller OPS_WEBHOOK_TOKEN saknas)."
  echo "    Sätt OPS_WEBHOOK_TOKEN=<en lång slumpsträng> och kör om efter första deploy."
fi

# Service-account till Pub/Sub-systemet behöver inte Cloud Run invoker eftersom
# webhook-endpointen är public (skyddas av token). När/om vi migrerar till OIDC:
# gcloud run services add-iam-policy-binding $SERVICE \
#   --member=serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com \
#   --role=roles/run.invoker --region=$REGION

# ---- 8. Eventarc-trigger: compile vid Firestore-skrivningar ---------------
# (frivilligt — skapas bara om det inte redan finns, kräver att firestore-db
#  använder native mode i samma projekt)
TRIGGER="compile-on-firestore-write"
if ! gcloud eventarc triggers describe "$TRIGGER" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Skapar Eventarc-trigger: $TRIGGER (compile på raw_items-writes)"
  gcloud eventarc triggers create "$TRIGGER" \
    --location="$REGION" --project="$PROJECT_ID" \
    --destination-run-service="$SERVICE" \
    --destination-run-region="$REGION" \
    --destination-run-path="/api/jobs/compile-via-eventarc" \
    --event-filters="type=google.cloud.firestore.document.v1.written" \
    --event-filters="database=(default)" \
    --event-filters-path-pattern="document=clients/{client_id}/employees/{eid}/raw_items/{itemId}" \
    --service-account="$SA_EMAIL" \
    || echo "==> Eventarc kunde inte skapas — kör manuellt om Firestore inte är native mode"
fi

echo
echo "==> Bootstrap klart."
echo "Nästa steg:"
echo "  1. Säkerställ att secrets finns i Secret Manager (se README.md)."
echo "  2. Trigga första bygget: gcloud builds submit --config cloudbuild.yaml ."
echo "  3. Onboarda en pilotkund via /insider-graph/kunder."
echo "  4. Kör 'Kör scrape-active' + 'Kompilera' från UI för att verifiera flödet."
echo "  5. (Valfritt) Clean-URL på egen domän: se docs/clean-url-cutover.md"
