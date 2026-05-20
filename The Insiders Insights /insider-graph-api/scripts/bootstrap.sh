#!/usr/bin/env bash
#
# Engångs-bootstrap för Insider Graph på Google Cloud.
#
# Skapar:
#   - Artifact Registry-repo för images
#   - GCS-bucket för JSON-LD (CDN-origin)
#   - Service-account för insider-graph-api
#   - IAM-bindningar (Firestore, GCS, Secret Manager)
#   - Cloud Run Jobs (scrape-active, scrape-episodic, compile-all-schemas, polling-weekly)
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
SERVICE="insider-graph-api"
SA_NAME="insider-graph-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="${CDN_BUCKET:-insider-graph-cdn-${PROJECT_ID}}"
REPO="insider-graph-repo"
IMAGE="europe-north1-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

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
gsutil cors set <(cat <<'JSON'
[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type"],"maxAgeSeconds":300}]
JSON
) "gs://$BUCKET"

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
  --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},CDN_BUCKET=${BUCKET},CDN_BASE_URL=https://storage.googleapis.com/${BUCKET}" \
  --update-secrets="ADMIN_API_KEY=insider-graph-admin-key:latest,OPENAI_API_KEY=openai-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,BRIGHTDATA_API_KEY=brightdata-api-key:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=brightdata-profile-dataset:latest,BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=brightdata-company-dataset:latest,BRIGHTDATA_LINKEDIN_POSTS_DATASET_ID=brightdata-posts-dataset:latest" \
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
      --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},CDN_BUCKET=${BUCKET},CDN_BASE_URL=https://storage.googleapis.com/${BUCKET}" \
      --update-secrets="OPENAI_API_KEY=openai-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,BRIGHTDATA_API_KEY=brightdata-api-key:latest,BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=brightdata-profile-dataset:latest,BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=brightdata-company-dataset:latest,BRIGHTDATA_LINKEDIN_POSTS_DATASET_ID=brightdata-posts-dataset:latest"
  else
    echo "==> Skapar job: $NAME"
    gcloud run jobs create "$NAME" \
      --image="$IMAGE" --region="$REGION" --project="$PROJECT_ID" \
      --service-account="$SA_EMAIL" \
      --command="python" --args="-m,$CMD" \
      --max-retries=1 \
      --set-env-vars="FIRESTORE_PROJECT_ID=${PROJECT_ID},CDN_BUCKET=${BUCKET},CDN_BASE_URL=https://storage.googleapis.com/${BUCKET}" \
      --set-secrets="OPENAI_API_KEY=openai-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,BRIGHTDATA_API_KEY=brightdata-api-key:latest,BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=brightdata-profile-dataset:latest,BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=brightdata-company-dataset:latest,BRIGHTDATA_LINKEDIN_POSTS_DATASET_ID=brightdata-posts-dataset:latest"
  fi
}

create_or_update_job scrape-active        jobs.scrape_active
create_or_update_job scrape-episodic      jobs.scrape_episodic
create_or_update_job compile-all-schemas  jobs.compile_all_schemas
create_or_update_job polling-weekly       jobs.polling_weekly

# ---- 7. Cloud Scheduler-triggers ------------------------------------------
schedule_job() {
  local NAME="$1"; local CRON="$2"; local TARGET_JOB="$3"
  local URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${TARGET_JOB}:run"
  if gcloud scheduler jobs describe "$NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "==> Uppdaterar scheduler: $NAME"
    gcloud scheduler jobs update http "$NAME" \
      --location="$REGION" --project="$PROJECT_ID" \
      --schedule="$CRON" --time-zone="Europe/Stockholm" \
      --uri="$URI" --http-method=POST \
      --oauth-service-account-email="$SA_EMAIL"
  else
    echo "==> Skapar scheduler: $NAME"
    gcloud scheduler jobs create http "$NAME" \
      --location="$REGION" --project="$PROJECT_ID" \
      --schedule="$CRON" --time-zone="Europe/Stockholm" \
      --uri="$URI" --http-method=POST \
      --oauth-service-account-email="$SA_EMAIL"
  fi
}

# scrape-active dagligen 04:00, scrape-episodic måndagar 04:30,
# compile-all dagligen 05:00, polling tisdagar 06:00.
schedule_job scrape-active-daily     "0 4 * * *"  scrape-active
schedule_job scrape-episodic-weekly  "30 4 * * 1" scrape-episodic
schedule_job compile-all-daily       "0 5 * * *"  compile-all-schemas
schedule_job polling-weekly-tue      "0 6 * * 2"  polling-weekly

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
