<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploy & verification — staging is where we verify

**All changes go to staging directly — staging is where we verify everything that is built.** Push to `main` AND deploy, then check on staging.

- Staging URL: https://insiders-frontend-815335042776.europe-north1.run.app
- Cloud Run service: `insiders-frontend` (region `europe-north1`, project `round-plating-480321-j7`).
- **Deploy is currently MANUAL** — there is no Cloud Build trigger on push (`gcloud builds triggers list` returns 0). Despite the header in `frontend/cloudbuild.yaml` ("auto-deploy on push to main"), that trigger was never set up. A push to `main` alone does NOT update staging.
- To deploy, run Cloud Build with `frontend/cloudbuild.yaml` from the repo root (this is how prior staging builds were produced — manual `gcloud builds submit`). Build takes several minutes (timeout 1200s).
- TODO: set up the Cloud Build push trigger so `git push origin main` truly auto-deploys, matching the intended workflow.
