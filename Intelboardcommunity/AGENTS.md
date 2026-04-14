# AGENTS.md — AI Agent Context for Intelboard Community

## What This Project Is

Intelboard Community is a Wikipedia-style knowledge platform built with Next.js, TypeScript, and Firebase. It features hierarchical categories, on-demand Wikipedia content fetching with local persistence, community forums, event calendars, quizzes, and real-time chat.

## Read These First

1. `ARCHITECTURE.md` — full system architecture, data flow, design decisions
2. `Coding-guidelines.md` — TypeScript conventions, file structure, naming
3. `Testing-guidelines.md` — testing philosophy, tools, structure
4. `src/data/categories.ts` — the category hierarchy (core data structure)
5. `src/lib/firebase.ts` — Firebase config (conditionally initialized)

## Key Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build (MUST pass before merging)
npm run typecheck    # TypeScript check (MUST pass)
npm run lint         # ESLint (MUST pass)
npm run test         # Jest unit tests (MUST pass)
```

## Architecture Constraints

- **No Tailwind CSS** — we use CSS Modules + a global design system in `globals.css`
- **No `any` types** — use proper TypeScript types
- **Firebase is optional** — all Firebase code must handle `null` instances gracefully
- **localStorage for Wikipedia cache** — not Firestore. See `src/lib/wikiStorage.ts`
- **Static category data** — categories are defined in `src/data/categories.ts`, not fetched from a database
- **CSS custom properties** — use `var(--token-name)` from globals, never hardcode colors

## Things to Avoid

- Don't install Tailwind CSS or any CSS framework
- Don't add server-side Firebase Admin SDK (we use client-side Firebase only)
- Don't break the conditional Firebase initialization in `src/lib/firebase.ts`
- Don't use `document` or `window` at module scope — guard with `typeof window !== 'undefined'`
- Don't import from `@/lib/firestore.ts` in components that render during static generation
- Don't remove the `'use client'` directive from pages that use hooks

## File Patterns

- **New pages**: `src/app/<route>/page.tsx` + `<route>.module.css`
- **New components**: `src/components/<Name>.tsx` + `<Name>.module.css`
- **New utilities**: `src/lib/<name>.ts`
- **New tests**: `src/__tests__/<name>.test.ts`

## When Making Changes

1. Update `ARCHITECTURE.md` if you change the system structure
2. Run `npm run typecheck && npm run lint && npm run test && npm run build` before completing
3. Add tests for any new utility functions
4. Use the structured logger (`src/lib/logger.ts`) for error/info logging, not bare `console.log`
