# IntelBoard Architecture

## Overview
IntelBoard is a **Next.js 15** web application for managing IT requests, planning, talent matching, and team collaboration. It runs on **Google Cloud Run** with a **Cloud SQL PostgreSQL** database.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Server Actions) |
| Language | TypeScript |
| Styling | Tailwind CSS v4, CSS Variables (light/dark theme) |
| Database | PostgreSQL (Cloud SQL) |
| ORM | Drizzle ORM |
| Auth | NextAuth.js (credentials provider) |
| Hosting | Google Cloud Run |
| CI/CD | GitHub Actions → Cloud Run auto-deploy |
| Repo | GitHub (`gustwest/Intelboard`, branch: `dev`) |

## Directory Structure
```
app/                    # Next.js app router pages
  dashboard/            # Main dashboard (Your Intelboard)
  board/                # Kanban board for requests
  it-planner/           # IT Flora system planner + architect
  talent/               # Talent directory
  team/                 # Team management
  profile/              # User profiles
  api/auth/             # NextAuth API routes
components/             # Shared UI components
  ui/                   # Base UI primitives (shadcn-style)
  it-flora/             # IT Planner components (flow, modals, architect)
  chat-widget.tsx       # Global chat overlay
  site-header.tsx       # Navigation header
  theme-provider.tsx    # Light/dark mode via next-themes
lib/
  actions.ts            # Server Actions (all DB mutations)
  schema.ts             # Drizzle schema (all tables)
  db.ts                 # Database connection
  data.ts               # Read-only data fetching
  matching.ts           # Talent matching logic
store/
  it-flora/useStore.ts  # Zustand store for IT Planner state
scripts/                # DB seeding & admin scripts
drizzle/                # Migration files
```

## Database Schema (Key Tables)
- **`user`** — accounts, profiles, skills, roles
- **`requests`** — IT/consulting requests with lifecycle
- **`projects`** / **`project_views`** — IT Flora planner data
- **`systems`** / **`integrations`** / **`assets`** — IT landscape modeling
- **`conversations`** / **`messages`** / **`conversation_participants`** — real-time chat
- **`notifications`** — in-app notification system
- **`companies`** — multi-tenant company support

## Key Patterns
1. **Server Actions** — All mutations go through `lib/actions.ts` using `"use server"`. No REST API layer.
2. **Theme System** — CSS variables in `globals.css` with `:root` (light) and `.dark` (dark) selectors, toggled via `next-themes`.
3. **Role-based Access** — `RoleProvider` context provides current user role (Admin, Specialist, Customer, Guest).
4. **React Flow** — IT Planner uses `@xyflow/react` for system architecture diagrams.
5. **Chat** — Global chat widget with direct, group, and request-linked conversations.

## Cloud Infrastructure
```
GitHub (dev branch)
    ↓ GitHub Actions
Cloud Run (europe-north1)
    ↓ Cloud SQL Proxy
Cloud SQL PostgreSQL (europe-west1)
```

## Environment Variables (Cloud Run)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SOCKET_PATH` | Cloud SQL socket path |
| `AUTH_SECRET` | NextAuth session encryption |
| `NEXTAUTH_URL` | Canonical app URL |
| `AUTH_TRUST_HOST` | Trust Cloud Run proxy headers |
| `GEMINI_API_KEY` | Google Gemini API access |
