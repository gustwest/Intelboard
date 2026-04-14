# Intelboard Community — Testing Guidelines

## Philosophy

- Test **behavior**, not implementation details
- Every utility function in `src/lib/` must have unit tests
- Components are tested at the integration level (user interactions)
- Aim for **80%+ coverage** on utility code, focus on critical paths for UI

## Tools

| Tool | Purpose |
|------|---------|
| Jest | Test runner, assertions, mocking |
| React Testing Library | Component rendering & user interaction |
| ts-jest | TypeScript support for Jest |
| jest-environment-jsdom | DOM environment for component tests |

## Running Tests

```bash
npm run test           # Run all tests once
npm run test:watch     # Watch mode for development
npm run test -- --coverage  # Generate coverage report
```

## File Naming & Location

- Test files live in `src/__tests__/`
- Name pattern: `<module>.test.ts` or `<component>.test.tsx`
- Example: `src/__tests__/categories.test.ts`

## What to Test

### Must Test
- Category utility functions (findBySlug, getBreadcrumbs, getCategoryPath)
- Search functions (searchCategories, searchAll)
- localStorage persistence (wikiStorage read/write/check)
- Logger output formatting
- Data transformations

### Should Test
- Component rendering (does the component render without crashing?)
- User interactions (clicking tabs, buttons)
- Auth state changes (signed in vs signed out UI)

### Don't Test
- Third-party libraries (Firebase, Fuse.js internals)
- CSS styling
- Next.js framework behavior

## Test Structure

Use the **Arrange-Act-Assert** pattern:

```typescript
describe('findCategoryBySlug', () => {
  it('should return the category when slug exists', () => {
    // Arrange
    const slug = 'computing';

    // Act
    const result = findCategoryBySlug(slug);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Computing');
  });

  it('should return null for non-existent slug', () => {
    const result = findCategoryBySlug('nonexistent');
    expect(result).toBeNull();
  });
});
```

## Mocking

- Mock `localStorage` using `jest-environment-jsdom` (provides it automatically)
- Mock Firebase modules when testing components that use auth
- Never mock the module under test

## Before Committing

1. `npm run typecheck` — zero TypeScript errors
2. `npm run lint` — zero ESLint errors
3. `npm run test` — all tests pass
4. `npm run build` — production build succeeds
