#!/usr/bin/env bash
#
# Engångs-bootstrap för Insider Graph på Google Cloud.
#
# Skapar:
#   - Artifact Registry-repo för images
#   - GCS-bucket för JSON-LD (CDN-origin)
#   - Service-account för insider-graph-api
#   - IAM-bindningar (Firestore, GCS, Secret Manager)
#   - Cloud Run Jobs (scrape-active, scrape-episodic, scrape-website, extract-all-claims,
#     compile-all-schemas, polling-weekly, xml-sync, sunset-skills, quarterly-linkedin-todo,
#     compute-trust-gap, trust-gap-report, warmth-probes)
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
REPO="insider-graph-repo"
IMAGE="europe-north1-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

# Origin-URL som compile-schema sätter på profilsidan/schema.json. Default är den råa
# GCS path-style-URL:en (fungerar direkt, ingen LB krävs). Vid clean-URL-cutover:
# kör om med CDN_BASE_URL=https://${PROFILE_DOMAIN} EFTER att DNS pekar på LB-IP:t och
# certet är ACTIVE (se docs/clean-url-cutover.md). En enda variabel flyttar allt.
CDN_BASE_URL="${CDN_BASE_URL:-https://storage.googleapis.com/${BUCKET}}"
# Clean-URL-läge (rena katalog-URL:er, innehåll utan clients/-prefix). Sätts true
# vid cutover, tillsammans med CDN_BASE_URL → egen domän. Default false = path-style.
CDN_CLEAN_URLS="${CDN_CLEAN_URLS:-false}"

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
gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT_ID" \
  --service-account="$SA_EMAIL" \
  --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},CDN_BUCKET=${BUCKET},CDN_BASE_URL=${CDN_BASE_URL},CDN_CLEAN_URLS=${CDN_CLEAN_URLS}" \
  --update-secrets="OPENAI_API_KEY=insider-graph-openai-api-key:latest,GEMINI_API_KEY=insider-graph-gemini-api-key:latest,BRIGHTDATA_API_KEY=insider-graph-brightdata-api-key:latest,BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=insider-graph-brightdata-linkedin-profile-dataset-id:latest,BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=insider-graph-brightdata-linkedin-company-dataset-id:latest" \
  || echo "==> Service finns ej ännu — kör cloudbuild först"

# ---- 6. Cloud Run Jobs -----------------------------------------------------
create_or_update_job() {
  local NAME="$1"; shift
  local CMD="$1"; shift
  if gcloud run jobs describe "$NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Uppdaterar job: $NAME"
    gcloud run jobs update "$NAME" \
      --image="$IMAGE" --region="$REGION" --project="$PROJECT_ID" \
      --service-account="$SA_EMAIL" \
      --command="python" --args="-m,$CMD" \
      --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},CDN_BUCKET=${BUCKET},CDN_BASE_URL=${CDN_BASE_URL},CDN_CLEAN_URLS=${CDN_CLEAN_URLS}" \
      --update-secrets="OPENAI_API_KEY=insider-graph-openai-api-key:latest,GEMINI_API_KEY=insider-graph-gemini-api-key:latest,BRIGHTDATA_API_KEY=insider-graph-brightdata-api-key:latest,BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=insider-graph-brightdata-linkedin-profile-dataset-id:latest,BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=insider-graph-brightdata-linkedin-company-dataset-id:latest"
  else
    echo "==> Skapar job: $NAME"
    gcloud run jobs create "$NAME" \
      --image="$IMAGE" --region="$REGION" --project="$PROJECT_ID" \
      --service-account="$SA_EMAIL" \
      --command="python" --args="-m,$CMD" \
      --max-retries=1 \
      --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},CDN_BUCKET=${BUCKET},CDN_BASE_URL=${CDN_BASE_URL},CDN_CLEAN_URLS=${CDN_CLEAN_URLS}" \
      --set-secrets="OPENAI_API_KEY=insider-graph-openai-api-key:latest,GEMINI_API_KEY=insider-graph-gemini-api-key:latest,BRIGHTDATA_API_KEY=insider-graph-brightdata-api-key:latest,BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=insider-graph-brightdata-linkedin-profile-dataset-id:latest,BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=insider-graph-brightdata-linkedin-company-dataset-id:latest"
  fi
}

create_or_update_job scrape-active           jobs.scrape_active
create_or_update_job scrape-episodic         jobs.scrape_episodic
create_or_update_job scrape-website          jobs.scrape_website
create_or_update_job extract-all-claims      jobs.extract_all_claims
create_or_update_job compile-all-schemas     jobs.compile_all_schemas
create_or_update_job polling-weekly          jobs.polling_weekly
create_or_update_job xml-sync                jobs.xml_sync
create_or_update_job sunset-skills           jobs.sunset_skills
create_or_update_job quarterly-linkedin-todo jobs.quarterly_todo
# Humaniseringslager & Förtroendegap (docs/humanization-trust-gap-spec.md):
create_or_update_job compute-trust-gap        jobs.compute_trust_gap
create_or_update_job trust-gap-report         jobs.trust_gap_report
create_or_update_job warmth-probes            jobs.warmth_probes

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
# scrape-active dagligen 04:00, scrape-episodic måndagar 04:30,
# extract-all-claims dagligen 04:45 (efter inhämtning, FÖRE compile så dagens claims
# kommer med), compile-all dagligen 05:00, polling tisdagar 06:00.
schedule_job scrape-website-weekly   "45 3 * * 1" scrape-website
schedule_job scrape-active-daily     "0 4 * * *"  scrape-active
schedule_job scrape-episodic-weekly  "30 4 * * 1" scrape-episodic
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
