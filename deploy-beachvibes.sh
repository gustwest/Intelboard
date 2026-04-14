#!/bin/bash

# Configuration
PROJECT_ID="round-plating-480321-j7"
REGION="europe-west1"
REPO_NAME="intelboard-repo"
IMAGE_NAME="beachvibes-app"
SERVICE_NAME="beachvibes-app"
DB_INSTANCE_CONNECTION_NAME="round-plating-480321-j7:europe-west1:intelboard-db-instance"
DB_USER="intelboard_user"
DB_PASS="YVGsrjf6Npfhvv+y" # In production, use Secret Manager. For now, hardcoding for speed.
DB_NAME="intelboard_db"

# Absolute path to gcloud (users env)
GCLOUD_BIN="/Users/gustavwestergren/Documents/AntiGravityRepo/google-cloud-sdk/bin/gcloud"

echo "========================================================"
echo "Deploying to Cloud Run for Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "========================================================"

# 1. Enable APIs
echo "Enabling necessary APIs (Cloud Run, Artifact Registry, Cloud Build)..."
"$GCLOUD_BIN" services enable run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$PROJECT_ID"

# 2. Build & Submit Image (using Cloud Build)
echo "Building and Submitting Container Image (this takes a while)..."
# We need to make sure we are not sending huge node_modules context (handled by .gcloudignore)
IMAGE_PATH="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME"
"$GCLOUD_BIN" builds submit --tag "$IMAGE_PATH" --project="$PROJECT_ID"

# 3. Deploy to Cloud Run
# Construct connection string for Cloud Run (using Unix socket)
# Note: Drizzle/Postgres.js needs ?host=/cloudsql/...
RUN_DB_URL="postgres://$DB_USER:$DB_PASS@localhost/$DB_NAME?host=/cloudsql/$DB_INSTANCE_CONNECTION_NAME"

echo "Deploying Service to Cloud Run..."
"$GCLOUD_BIN" run deploy "$SERVICE_NAME" \
    --image="$IMAGE_PATH" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --allow-unauthenticated \
    --add-cloudsql-instances="$DB_INSTANCE_CONNECTION_NAME" \
    --set-env-vars="DATABASE_URL=$RUN_DB_URL"

echo "========================================================"
echo "Deployment Complete!"
echo "Service URL should be above."
echo "========================================================"
