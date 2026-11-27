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
| Backend units | `tests/unit/backend/*` | Exam engine, SRS, rate limiting, auth hardening, session verify, security isolation, validation, badges, streaks, AI providers/search; adaptive contracts, blueprints, profiles, scoring, historical ingestion/analytics and question pipeline |
| Adaptive backend units | `tests/unit/backend/adaptive-duplicate-verification.test.ts`, `adaptive-library-privacy.test.ts`, `adaptive-live-import.test.ts` | Identity normalization, exact/near/template/concept/revision duplicate decisions, independent answer verification and evidence gating, library privacy/upcoming metadata, admin live-import verification/eligibility |
| Frontend units | `tests/unit/frontend/*` | Markdown renderer, toaster, conversation list; `adaptive-exam-ui.test.ts` covers tab/icon/nav registration, flag default, and crash-safe submit recovery |
| API routes | `tests/api/routes.test.ts` | Auth login/register/me (status codes, cookie flags, revocation), submission bounds (200-answer cap), CSRF origin checks, rate-limit 429s |
| Adaptive API seam | `tests/api/adaptive-exam.routes.test.ts` | Route-set inventory, `runAdaptiveRoute` delegation, admin-only opt-in, no body `userId`, 401/403/400/429 and correlation/timing headers |
| Integration | `tests/integration/*` | Real-Postgres run of the progress upsert (runs in CI via a Postgres service container) |
| E2E (Playwright) | `tests/e2e/*.spec.ts` | `signup-mock-test` (signup → onboarding → first mock test, plus seeded-demo login), `home-sprint-flows` (public landing), `byos` (storage flows, API-mocked), and `dashboard-audit` (all 20 dashboard tabs including flag-enabled `adaptive-exam`: overflow at 5 viewports × 2 themes/locales, 44px touch targets, 11px type floor, axe serious/critical — ratcheted against `tests/e2e/dashboard-audit-baseline.json`). Needs a seeded DB (`npm run db:seed`) and the new adaptive tables (`npm run db:push`); `tests/e2e/browser-logs.ts` fails on uncaught page exceptions and screenshots failures |

## Known Gaps

- **AI route streaming**: `/api/ai/tutor` stream behavior untested at HTTP level.
- **Accessibility**: the dashboard is gated by `tests/e2e/dashboard-audit.spec.ts` (axe-core serious/critical, 44px targets, 11px type floor, zero overflow — all 19 tabs baselined); the public/landing surfaces are not, and there is no Lighthouse gate.
- **Baseline harvest caveat**: Playwright clears `test-results/` at each run, so `AUDIT_WRITE_BASELINE=1 npx playwright test tests/e2e/dashboard-audit.spec.ts` must be run for **all** tabs in a single pass before `node scripts/merge-audit-baseline.mjs` (which rebuilds the baseline wholesale from the harvest directory).
- **Adaptive real-provider exit run**: the staged BCS/SO/AD generation runs in `docs/ADAPTIVE_EXAM_IMPLEMENTATION_PLAN.md` §12.4 are not yet recorded; simulated batches are labelled `SIMULATED` and are not evidence of provider output quality.

## Adaptive Exam verification

- Unit/API/frontend coverage for the V2 seam lives in the files listed above;
  run `npx vitest run tests/unit/backend/adaptive-*.test.ts tests/unit/frontend/adaptive-exam-ui.test.ts tests/api/adaptive-exam.routes.test.ts` for a focused pass.
- Duplicate/verification tests assert that `claimedAnswer` alone never becomes a
  verified key, that mock output cannot satisfy verification, that only hashes
  enter `AdaptiveQuestionExposure`, and that library/upcoming rows never leak
  paper content or answer keys.
- Submission recovery tests cover pending-payload persistence, concurrent-click
  rendezvous, authoritative `COMPLETED`/`EXPIRED` reconciliation and retry with
  the original idempotency key.
- Browser verification requires the feature flag enabled (the default unless
  explicitly `NEXT_PUBLIC_ADAPTIVE_EXAM_V2=false`), a seeded database, and
  `npm run db:push` for the adaptive tables. Before harvest, confirm the tab is
  absent when the flag is disabled and present at
  `/dashboard?tab=adaptive-exam` when enabled; then run the all-tab audit in a
  single pass and merge its baseline.

## Running Tests

```bash
npm run test              # Run once
npm run test:watch        # Watch mode
npm run test:coverage     # Enforce coverage thresholds
npm run test:e2e          # Playwright suite (needs seeded DB: npm run db:seed)
                          # Builds + starts a production `next start` server via
                          # the Playwright webServer — no dev server needed.
```

## Content & Data QA

The question bank and math content have their own mechanical QA tooling
(agent-verifiable — see `AGENTS.md` §6):

| Command | Purpose |
|---------|---------|
| `npm run qa:audit` / `qa:audit:report` | Question-bank integrity audit (+ saved report) |
| `npm run qa:normalize` / `qa:normalize:apply` | Detect/apply normalization of question text |
| `npm run qa:validate` | Validate the bank after changes |
| `npm run qb:forensics` | Deep inspection of suspect question rows (see `scripts/qb-forensics/README.md`) |
| `npm run qb:clean-broken(:apply/:verify)` | Detect/remove/verify broken questions |
| `npm run math:audit` | Scan for LaTeX/math rendering artifacts |
| `npm run math:heal(:apply)` | Heal math artifacts (report-only / apply) |

Artifacts land in `scripts/qb-audit/artifacts/`. ADR-0015 made the import
gate + one-time cleanup sweep part of the content pipeline.

## Performance & Load

| Command | Purpose |
|---------|---------|
| `npm run analyze` | Webpack build + bundle-analyzer report |
| `npm run perf:baseline` | Establish the committed client-JS perf budget (`scripts/perf-budget.ts --baseline`) |
| `npm run perf:check` | Enforce the budget — this is the CI `perf` job (ADR-0012, ADR-0014, ADR-0063) |
| `npm run test:load` | k6 load test (`scripts/load-test.js`) |

A failing `perf:check` means client JS grew past the committed budget — trim
the bundle or re-baseline deliberately via an ADR, never silently.

## CI/CD

- CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests with enforced
  coverage against a real Postgres 16 service container, then build —
  plus parallel `e2e` (seeded Postgres + Playwright/chromium) and `perf` jobs.
- Dependabot keeps npm deps and actions current (`.github/dependabot.yml`).
- Debugging test failures: `DEBUGGING.md` §3.2 (rate-limit 429s, Prisma test
  double, `server-only` stub, seeded-DB requirements).
