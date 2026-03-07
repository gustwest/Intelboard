# Coding Guidelines

## Language & Style
- **TypeScript** for all files. No `any` types in new code without justification.
- Use `"use server"` directive at top of server action files.
- Prefer named exports over default exports.

## Component Patterns
- **Server Components** by default. Add `"use client"` only when needed (state, effects, event handlers).
- Keep components focused — one responsibility per file.
- Colocate types with their component unless shared across features.

## Styling
- Use **Tailwind CSS v4** utility classes.
- Use **semantic theme tokens** (e.g., `bg-card`, `text-foreground`, `border-border`) — never hardcode colors.
- CSS variables live in `app/globals.css`. Both `:root` (light) and `.dark` (dark) must be updated together.
- Never use `text-white`, `bg-white`, `bg-slate-*` directly — use theme variables instead.

## Database
- All queries go through **Drizzle ORM** (`lib/db.ts`).
- Schema changes go in `lib/schema.ts`.
- After schema changes: run `npx drizzle-kit push` locally, then push and let the Cloud SQL proxy + `drizzle-kit push` sync cloud DB.
- Always wrap mutations in try/catch with `console.error` logging.

## Server Actions (`lib/actions.ts`)
- All mutations are server actions in a single file for discoverability.
- Always return `{ success: boolean, error?: string }` for user-facing operations.
- Use `revalidatePath()` after mutations to bust Next.js cache.

## Error Handling
- Log errors with `console.error("[Feature] message:", error)` for Cloud Run log visibility.
- Include DB error codes in error messages when available.
- Never expose raw database errors to the client.

## Git Workflow
- Work on `dev` branch. GitHub Actions auto-deploys to Cloud Run on push.
- Write descriptive commit messages: `feat:`, `fix:`, `refactor:`, `docs:`.
- Test locally with `npm run dev` before pushing.
- Run `npx next build` to verify before push.
