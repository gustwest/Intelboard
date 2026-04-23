#!/bin/bash

# ─────────────────────────────────────────────────────
# AIDAS — Deploy to Cloud Run
# Builds container with Cloud Build and deploys
# ─────────────────────────────────────────────────────

PROJECT_ID="round-plating-480321-j7"
REGION="europe-north1"
REPO_NAME="aidas-repo"
IMAGE_NAME="aidas-app"
SERVICE_NAME="aidas-app"
DB_INSTANCE_CONNECTION_NAME="round-plating-480321-j7:europe-north1:dvoucher-db"
DB_USER="dvoucher_user"
DB_PASS="${DB_PASS:?Please set DB_PASS environment variable}"
DB_NAME="aidas"

GCLOUD_BIN="/Users/gustavwestergren/Documents/AntiGravityRepo/google-cloud-sdk/bin/gcloud"

echo "════════════════════════════════════════════"
echo "Deploying AIDAS to Cloud Run"
echo "Project: $PROJECT_ID  |  Region: $REGION"
echo "════════════════════════════════════════════"

# 1. Enable APIs
echo "→ Enabling APIs..."
"$GCLOUD_BIN" services enable run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$PROJECT_ID"

# 2. Create Artifact Registry (if not exists)
echo "→ Ensuring Artifact Registry exists..."
"$GCLOUD_BIN" artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for AIDAS" \
    --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists)"

# 3. Build & Submit Image
IMAGE_PATH="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME"
echo "→ Building container image (this may take a few minutes)..."
"$GCLOUD_BIN" builds submit --tag "$IMAGE_PATH" --project="$PROJECT_ID"

# 4. Deploy to Cloud Run
RUN_DB_URL="postgres://$DB_USER:$DB_PASS@localhost/$DB_NAME?host=/cloudsql/$DB_INSTANCE_CONNECTION_NAME"

echo "→ Deploying to Cloud Run..."
"$GCLOUD_BIN" run deploy "$SERVICE_NAME" \
    --image="$IMAGE_PATH" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=3 \
    --add-cloudsql-instances="$DB_INSTANCE_CONNECTION_NAME" \
    --update-env-vars="DATABASE_URL=$RUN_DB_URL,AUTH_SECRET=${AUTH_SECRET:-$(openssl rand -base64 32)}"

echo ""
echo "════════════════════════════════════════════"
echo "✅ AIDAS Deployment Complete!"
echo "════════════════════════════════════════════"

SERVICE_URL=$("$GCLOUD_BIN" run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)' 2>/dev/null)
echo "🌐 URL: $SERVICE_URL"
echo ""
echo "⚠️  Remember to:"
echo "  1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Cloud Run"
echo "  2. Add $SERVICE_URL/api/auth/callback/google to OAuth redirect URIs"
echo "  3. Set NEXTAUTH_URL=$SERVICE_URL on Cloud Run"
