# Testing

## Framework

- **Vitest** 3 with `@testing-library/react` and `jsdom` (per-file Node opt-in
  for tests that sign real JWTs or hit raw SQL).
- Coverage: Istanbul, thresholds **enforced in CI** (`npm run test -- --run --coverage`).
  Thresholds are set to actual current coverage and must be ratcheted up over
  time — never lowered.

## Test Location

- `tests/` — root-level test directory.
- `tests/setup.ts` — global setup: polyfills, `server-only` stub, `next/headers`
  + `next/navigation` mocks, and a hand-maintained Prisma client double.
- `tests/api/routes.test.ts` — route-handler integration suite (real handlers,
  real Requests; Prisma + rate-limit store mocked).

## Current Tests (high level)

| Area | Files | What is covered |
|------|-------|-----------------|
| Component | `tests/*.test.tsx` (~10) | Auth experience, dashboard tabs, landing, public pages |
| Backend units | `tests/unit/backend/*` (~20) | Exam engine, SRS, rate limiting, auth hardening, session verify, security isolation, validation, badges, streaks, AI providers/search |
| Frontend units | `tests/unit/frontend/*` | Markdown renderer, toaster, conversation list |
| API routes | `tests/api/routes.test.ts` | Auth login/register/me (status codes, cookie flags, revocation), submission bounds (200-answer cap), CSRF origin checks, rate-limit 429s |
| Integration | `tests/integration/*` | Real-Postgres run of the progress upsert (runs in CI via a Postgres service container) |
| E2E (Playwright) | `tests/e2e/*.spec.ts` | `signup-mock-test` (signup → onboarding → first mock test, plus seeded-demo login), `home-sprint-flows` (public landing), `byos` (storage flows, API-mocked). Needs a seeded DB (`npm run db:seed`); `tests/e2e/browser-logs.ts` fails on uncaught page exceptions and screenshots failures |

## Known Gaps

- **AI route streaming**: `/api/ai/tutor` stream behavior untested at HTTP level.
- **Accessibility/performance**: no axe-core or Lighthouse gates.

## Running Tests

```bash
npm run test              # Run once
npm run test:watch        # Watch mode
npm run test:coverage     # Enforce coverage thresholds
npm run test:e2e          # Playwright suite (needs seeded DB: npm run db:seed)
```

## CI/CD

- CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests with enforced
  coverage against a real Postgres 16 service container, then build —
  plus parallel `e2e` (seeded Postgres + Playwright/chromium) and `perf` jobs.
- Dependabot keeps npm deps and actions current (`.github/dependabot.yml`).
