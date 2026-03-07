# Testing Guidelines

## Pre-Push Checklist
1. `npm run dev` — app starts without errors
2. `npx next build` — production build succeeds (all routes compile)
3. Manually test affected pages in browser

## Cloud Testing
- **Cloud Run URL:** `https://intelboard-test-815335042776.europe-north1.run.app`
- **Logs:** `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="intelboard-test" AND severity>=ERROR' --limit 20 --format=json`
- **Stderr:** `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="intelboard-test" AND logName:"stderr"' --limit 10 --format=json`
- **Cloud SQL Proxy:** `cloud-sql-proxy round-plating-480321-j7:europe-west1:intelboard-db-instance --port 5433`

## Database Testing
- Connect via proxy: `DATABASE_URL="postgres://intelboard_user:<password>@localhost:5433/intelboard_db"`
- Push schema: `DATABASE_URL=... npx drizzle-kit push`
- Verify tables: run a quick Node.js script to `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`

## Page Coverage (Manual)
| Page | Key Checks |
|------|-----------|
| Dashboard | Stats load, pipeline counts, recent requests, chat bubble |
| Board | Kanban columns, drag cards, request details panel |
| IT Planner | Projects list, flow canvas, system nodes, lineage view |
| Talent | User cards, search, filtering |
| Team | Team members, role management |
| Profile | Edit bio, skills, experience |
| Chat | New direct chat, group chat, send messages, notifications |
| Theme | Toggle light/dark, verify contrast on all pages |

## Common Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| `42P01` | Table doesn't exist | Run `drizzle-kit push` against cloud DB |
| `23505` | Unique constraint violation | Check for duplicate inserts |
| `23503` | Foreign key violation | Ensure referenced record exists |
| `500` | Server error | Check Cloud Run stderr logs |
