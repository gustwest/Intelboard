# Intelboard Community — Coding Guidelines

## TypeScript

- **Strict mode** — `strict: true` in tsconfig. No `any` types unless absolutely necessary.
- **Explicit return types** on exported functions.
- **Interface over type** for object shapes (interfaces are extendable).
- **Enum alternatives** — use `as const` objects instead of enums for better tree-shaking.

## File Organization

```
// 1. 'use client' directive (if needed)
// 2. External imports (react, next, libraries)
// 3. Internal imports (components, lib, data)
// 4. Types/interfaces
// 5. Constants
// 6. Component/function definition
// 7. Export
```

## Components

- One component per file, named after the file
- Use `'use client'` only when hooks or interactivity are needed
- Extract complex logic into custom hooks (`useXxx`)
- Props interfaces named `XxxProps`
- Destructure props in function signature

```typescript
interface CategoryCardProps {
  category: Category;
  onClick?: () => void;
}

export default function CategoryCard({ category, onClick }: CategoryCardProps) {
  // ...
}
```

## CSS Modules

- One `.module.css` per component, co-located with the component
- Use `camelCase` for class names: `.categoryCard`, not `.category-card`
- Reference design tokens from `globals.css`: `var(--primary-400)`, not hardcoded colors
- Responsive breakpoints: `768px` (tablet), `480px` (mobile)
- Use `glass-card`, `btn-primary`, `btn-secondary`, `badge` utility classes from globals

## Error Handling

- Wrap async operations in `try/catch`
- Log errors with the structured logger: `logger.error('context', { error })`
- Show user-friendly error states, never raw error messages
- Firebase operations should degrade gracefully when Firebase is not configured

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files (components) | PascalCase | `ForumTab.tsx` |
| Files (utilities) | camelCase | `wikiStorage.ts` |
| CSS modules | `component.module.css` | `ForumTab.module.css` |
| Interfaces | PascalCase | `ForumThread` |
| Functions | camelCase | `fetchWikiInfo` |
| Constants | UPPER_SNAKE_CASE | `MAX_RESULTS` |
| CSS classes | camelCase | `.threadCard` |
| Route folders | kebab-case | `category/[...slug]` |

## Commit Messages

Use conventional commits:

```
feat: add persistent Wikipedia content caching
fix: resolve Firebase null reference in firestore helpers
docs: add ARCHITECTURE.md steering document
test: add unit tests for category utilities
refactor: extract wiki storage to separate module
```

## Performance

- Avoid `useEffect` for derived state — use `useMemo` instead
- Lazy-load heavy components with `React.lazy` + `Suspense`
- Use `key` props correctly to avoid unnecessary re-renders
- Images from Wikipedia should include `alt` text
- Keep bundle size in check — no unnecessary large dependencies
