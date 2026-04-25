@AGENTS.md

# TopOfMinds — Project Guidelines

## Deployment Policy

**ALLTID pusha till staging.** Alla kodändringar ska committas och pushas till `main`-branchen, som automatiskt deployas till staging via Cloud Build (Google Cloud Run).

- **Branch**: `main`
- **Auto-deploy trigger**: Push till main → Cloud Build → Cloud Run (`topofminds-app`)
- **Region**: `europe-north1`
- **GCP Project**: `round-plating-480321-j7`
- **Deploy script (manuell)**: `./deploy-cloud-run.sh`

### Workflow
1. Gör kodändringar
2. `git add . && git commit -m "beskrivning" && git push origin main`
3. Cloud Build bygger Docker-image med Kaniko (cachad Chromium/Puppeteer)
4. Cloud Run deployas automatiskt
5. Verifiera på staging-URL

## Architecture

- **Framework**: Next.js (App Router)
- **Database**: PostgreSQL (Cloud SQL)
- **ORM**: Prisma
- **AI**: Vertex AI (Gemini/Claude via Vertex)
- **Scraping**: Puppeteer-core (Chromium i Docker)
- **Auth**: Google OAuth (Workspace-only)

## Key Directories
- `src/lib/scrapers/` — Plattformsspecifika scrapers (Keyman, Upgraded, Cinode, A Society)
- `src/lib/assignments/` — Intake + AI-extraktion
- `src/app/api/admin/sources/` — Käll-API (CRUD + check)
- `src/app/admin/` — Admin UI
- `prisma/schema.prisma` — Databasschema

## Conventions
- Credentials lagras krypterat i databasen (AES-256-GCM via `src/lib/crypto.js`)
- Scrapers skickar data till `/api/assignments/intake` med `source: 'BROKER_SCRAPE'`
- Alla nya scrapers läggs till i `src/lib/scrapers/engine.js` dispatcher
