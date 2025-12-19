#!/bin/bash

# Kill any existing proxy
lsof -ti:5432 | xargs kill -9 2>/dev/null

echo "Starting Cloud SQL Proxy..."
/Users/gustavwestergren/Documents/AntiGravityRepo/google-cloud-sdk/bin/cloud-sql-proxy round-plating-480321-j7:europe-west1:intelboard-db-instance --port 5432 &

echo "Waiting for proxy to start..."
sleep 2

echo "Starting Next.js development server..."
npm run dev
