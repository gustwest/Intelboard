<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploy & verification — push to main auto-deploys to staging

**All changes are pushed to `main` directly — staging is where we verify everything that is built.** A push to `main` auto-deploys; just push, wait a few minutes, then verify on staging.

- Staging URL: https://insiders-frontend-815335042776.europe-north1.run.app
- Cloud Run service: `insiders-frontend` (region `europe-north1`, project `round-plating-480321-j7`).
- **Auto-deploy is live** via Cloud Build trigger **`insiders-frontend-staging`** — note it lives in region **`europe-west1`** (so `gcloud builds list` / `triggers list` must use `--region=europe-west1` to see it; the default/global region shows nothing). Fires on push to `^main$`, filtered to `The Insiders Insights /frontend/**`, runs `frontend/cloudbuild.yaml`.
- Build takes several minutes (timeout 1200s). If staging shows old content right after a push, the build is still running — check `gcloud builds list --region=europe-west1`, then hard-refresh.
- Sibling services have their own europe-west1 triggers too (insiders-api-staging, insider-graph-api-staging, ontopofit-staging, aidas-staging, topofminds-staging, dvoucher-staging).
