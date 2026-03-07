# AGENTS.md — AI Agent Instructions

Read this file before making any changes to the IntelBoard codebase.

## Required Reading
Before starting work, read these files:
- `ARCHITECTURE.md` — system design and directory structure
- `CODING-GUIDELINES.md` — coding standards and patterns
- `TESTING-GUIDELINES.md` — how to test and debug
- `lib/schema.ts` — database schema (source of truth for all tables)
- `lib/actions.ts` — all server actions (mutations)

## Key Rules
1. **Never hardcode colors.** Use Tailwind theme tokens (`bg-card`, `text-foreground`, etc.). Check `app/globals.css` for available variables.
2. **All DB mutations** go through server actions in `lib/actions.ts`.
3. **Always wrap DB calls** in try/catch with descriptive `console.error` logging.
4. **Run `npx next build`** before committing to verify the build passes.
5. **Schema changes** require updating `lib/schema.ts` AND pushing to cloud DB.
6. **Test on the cloud environment** after pushing — check Cloud Run logs for errors.

## Cloud Environment
- **URL:** `https://intelboard-test-815335042776.europe-north1.run.app`
- **CI/CD:** GitHub Actions auto-deploys from `dev` branch
- **DB:** Cloud SQL PostgreSQL via socket proxy
- **Logs:** Use `gcloud logging read` commands from `TESTING-GUIDELINES.md`

## File Conventions
- Pages: `app/<route>/page.tsx`
- Components: `components/<name>.tsx` or `components/<feature>/<name>.tsx`
- Shared UI: `components/ui/<name>.tsx`
- IT Planner: `components/it-flora/...`
