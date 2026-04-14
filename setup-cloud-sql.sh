#!/bin/bash

# Configuration
PROJECT_ID="round-plating-480321-j7"
REGION="europe-west1"
INSTANCE_NAME="intelboard-db-instance"
DB_NAME="intelboard_db"
DB_USER="intelboard_user"
# Generate a random password if not provided
DB_PASS=${DB_PASS:-$(openssl rand -base64 12)}

# Absolute path to gcloud to avoid PATH issues
GCLOUD_BIN="/Users/gustavwestergren/Documents/AntiGravityRepo/google-cloud-sdk/bin/gcloud"

echo "Setting up Cloud SQL for project: $PROJECT_ID in region: $REGION"

# 1. Enable APIs
echo "Enabling Cloud SQL Admin API..."
"$GCLOUD_BIN" services enable sqladmin.googleapis.com --project="$PROJECT_ID"

# 2. Create Instance (This can take a few minutes)
echo "Creating Cloud SQL Instance (PostgreSQL 14)..."
"$GCLOUD_BIN" sql instances create "$INSTANCE_NAME" \
    --database-version=POSTGRES_14 \
    --cpu=1 \
    --memory=3840MiB \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --root-password="$DB_PASS"

# 3. Create Database
echo "Creating Database '$DB_NAME'..."
"$GCLOUD_BIN" sql databases create "$DB_NAME" \
    --instance="$INSTANCE_NAME" \
    --project="$PROJECT_ID"

# 4. Create User
echo "Creating User '$DB_USER'..."
"$GCLOUD_BIN" sql users create "$DB_USER" \
    --instance="$INSTANCE_NAME" \
    --password="$DB_PASS" \
    --project="$PROJECT_ID"

# 5. Output Connection Info
echo "---------------------------------------------------"
echo "Setup Complete!"
echo "Instance: $INSTANCE_NAME"
echo "Database: $DB_NAME"
echo "User:     $DB_USER"
echo "Password: $DB_PASS"
echo "Region:   $REGION"
echo "---------------------------------------------------"
echo "Connection Name:"
"$GCLOUD_BIN" sql instances describe "$INSTANCE_NAME" --project="$PROJECT_ID" --format="value(connectionName)"
echo "---------------------------------------------------"
echo "Make sure to save the Password and Connection Name!"
