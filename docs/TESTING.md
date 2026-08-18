# Testing

## Framework

- **Vitest** 3.0.0 with `@testing-library/react` and `jsdom`.

## Test Location

- `tests/` — root-level test directory.
- `tests/setup.ts` — global test setup (`@testing-library/jest-dom`).

## Current Tests

| File | Type | Coverage |
|------|------|----------|
| `tests/FlashNewsModal.test.tsx` | Component | FlashNewsModal rendering |
| `tests/NewFeatures.test.tsx` | Component | StudyPlannerTab, FlashcardsTab, MockTestTab, AISolverTab, DailyQuizWidget, NotificationCenter, OfflineModeTab, ThemeToggle |

## Missing Coverage

- **API integration tests**: No tests for `app/api/*` routes.
- **Auth flow tests**: No tests for login, register, logout.
- **Backend service tests**: No tests for `backend/services/*`.
- **E2E tests**: No Playwright or Cypress tests.
- **Database tests**: No Prisma integration tests.
- **AI evaluation tests**: No tests for `/api/ai/*` endpoints.
- **Accessibility tests**: No axe-core or similar.
- **Performance tests**: No Lighthouse or bundle size tests.

## Running Tests

```bash
npm run test          # Run once
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI (if configured)
```

## Writing Tests

- Use `render` and `screen` from `@testing-library/react`.
- Mock API calls where needed (e.g., `vi.mock("@/lib/services/api")`).
- Follow existing patterns in `tests/NewFeatures.test.tsx`.

## CI/CD

- No CI/CD pipeline configured.
- Tests are run locally before committing.
