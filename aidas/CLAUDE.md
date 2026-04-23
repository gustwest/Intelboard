# AIDAS — AI-Driven Analytics & Data Services

## Project Overview
AIDAS is a Next.js 16 application for intelligent data catalog management,
Data Vault modeling, and AI-powered analytics/reporting.

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Database:** PostgreSQL via Prisma 7 (Cloud SQL instance: dvoucher-db, database: aidas)
- **Auth:** NextAuth v5 with Google OAuth (JWT sessions)
- **Deployment:** Cloud Run (europe-north1), Cloud Build
- **Styling:** Vanilla CSS modules (NO Tailwind)

## Critical Rules
1. NEVER use Tailwind CSS. Use vanilla CSS modules only.
2. NEVER import from `@/lib/db` — use `@/lib/prisma` instead.
3. All database changes go through Prisma schema (`prisma/schema.prisma`).
4. Use `prisma db push` for schema sync, NOT migrations.
5. Keep CSS in `.module.css` files co-located with components.
6. Follow the dark-theme design system defined in `globals.css`.

## Project Structure
```
src/
├── app/
│   ├── (main)/          # Authenticated layout with sidebar
│   │   ├── admin/       # Kanban board + AI Agent panel
│   │   ├── catalog/     # Data catalog (DDL import, column analysis)
│   │   ├── modeling/    # Data Vault modeling canvas
│   │   ├── reports/     # PBI report generator
│   │   └── dashboard/   # Overview/landing page
│   ├── api/
│   │   ├── auth/        # NextAuth handlers
│   │   └── admin/       # Kanban + Agent API routes
│   └── login/           # Login page
├── lib/
│   ├── auth.ts          # NextAuth configuration
│   └── prisma.ts        # Prisma client singleton
└── middleware.ts        # Auth middleware
```

## Commands
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
./deploy-cloud-run.sh  # Deploy to Cloud Run
```

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_URL` — App URL
- `NEXTAUTH_SECRET` — JWT secret
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth credentials
- `AGENT_API_KEY` — API key for agent polling endpoint
