<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploy & verification — push to staging directly

**All changes are pushed to `main` directly. This is our staging environment and where we verify everything that is built.** Do not sit on changes waiting for local verification — get them onto staging so they can be checked there.

- `git push origin main` auto-deploys the frontend via Cloud Build (`frontend/cloudbuild.yaml`, Kaniko build → Cloud Run service `insiders-frontend`). Triggered whenever files under `The Insiders Insights /frontend/` change.
- Staging URL: https://insiders-frontend-815335042776.europe-north1.run.app
- A deploy can take several minutes (build timeout 1200s). If staging still shows old content right after a push, the build is likely still running — wait, then hard-refresh.
