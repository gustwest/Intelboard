#!/usr/bin/env bash
# deploy-cloud-run.sh — Deploy TopOfMinds to Google Cloud Run
#
# Usage: ./deploy-cloud-run.sh
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Cloud SQL instance created (dvoucher-db)
#   - Database "topofminds" created on the instance
#
set -euo pipefail

# ── Configuration ──
PROJECT_ID="round-plating-480321-j7"
REGION="europe-north1"
SERVICE_NAME="topofminds-app"
REPO_NAME="topofminds-repo"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
CLOUD_SQL_INSTANCE="${PROJECT_ID}:${REGION}:dvoucher-db"
DB_NAME="topofminds"
DB_USER="topofminds_user"
DB_PASS="topofminds2026"

echo "══════════════════════════════════════════════════"
echo "  🚀 Deploying TopOfMinds to Cloud Run"
echo "══════════════════════════════════════════════════"
echo ""
echo "  Project:   ${PROJECT_ID}"
echo "  Region:    ${REGION}"
echo "  Service:   ${SERVICE_NAME}"
echo "  SQL:       ${CLOUD_SQL_INSTANCE}"
echo ""

# ── Step 1: Ensure Artifact Registry repo exists ──
echo "📦 Step 1: Checking Artifact Registry..."
gcloud artifacts repositories describe "${REPO_NAME}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" 2>/dev/null || \
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --description="TopOfMinds container images"

# ── Step 2: Build & push Docker image ──
echo "🔨 Step 2: Building Docker image..."
gcloud builds submit \
  --tag="${IMAGE_NAME}:latest" \
  --project="${PROJECT_ID}" \
  --timeout=1200s

# ── Step 3: Deploy to Cloud Run ──
echo "🚀 Step 3: Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_NAME}:latest" \
  --platform=managed \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --port=3000 \
  --add-cloudsql-instances="${CLOUD_SQL_INSTANCE}" \
  --update-env-vars="\
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_INSTANCE},\
NODE_ENV=production,\
AGENT_POLL_SECRET=topofminds-agent-secret-2026"

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo ""

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --platform=managed \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null || echo "unknown")

echo "  🌐 URL: ${SERVICE_URL}"
echo "══════════════════════════════════════════════════"
