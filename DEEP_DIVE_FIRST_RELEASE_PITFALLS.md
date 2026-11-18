# Deep Dive: First Release Pitfalls & Drawbacks

## Executive Summary
This document catalogs the critical and high-impact pitfalls that must be addressed before launching the first release of 9Th-Grade AI. The analysis is based on a comprehensive scan of the codebase, including the Prisma schema, backend services, API routes, frontend components, AI system, and existing documentation (ADRs, pitfall register).

---

## 1. AI Provider Dependencies & Mock Fallbacks

### Status: **CRITICAL**
- **Problem**: The AI tutor, solver, and assistant endpoints (`/api/ai/*`) require API keys (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`) to function with real models. Without keys, the system falls back to mock responses labeled `source: "mock"`.
- **Impact**: The core AI features (tutor solving, exam explanations) are effectively non-functional without developer configuration of API keys. The mock fallback is clearly labeled but gives a degraded experience.
- **Evidence**: 
  - `backend/ai/application/services.ts` returns mock responses with `source: "mock"` when no API key is set (line 830)
  - `AI-SYSTEM.md` documents the provider hierarchy: Groq (primary) → Anthropic → Mock
  - Rate limiter (`backend/rate-limit.ts`) enforces per-user quotas but the underlying store is in-memory
- **Recommended Fix**:
  1. Document required env vars: `GROQ_API_KEY`, `ANTHROPIC_API_KEY`
  2. Add `.env.local.example` with placeholder keys and clear "set these for AI features" warnings
  3. Add startup warning when no AI keys are configured
  4. Gate AI feature visibility: hide AI tutor/solver cards when no keys are set

### Status: **HIGH**
- **Problem**: The Tavily web search grounding for the tutor is opt-in via `TAVILY_API_KEY` env var (ADR-009), not enabled by default. Without it, the tutor relies solely on model knowledge which may include inaccurate facts.
- **Impact**: Users may receive hallucinated or inaccurate factual answers, particularly for dates, names, and current events.
- **Recommended Fix**:
  1. Make Tavily search a soft dependency with graceful degradation
  2. Add runtime warning when web search is unavailable but user asks factual questions
  3. Document the tradeoff in the deployment guide

---

## 2. Authentication & Session Management

### Status: **CRITICAL**
- **Problem**: Email verification is non-functional in production. The `hasEmailTransport()` check in `backend/services/user.ts` returns `false` when no SMTP or Resend API key is configured, causing all accounts to auto-verify without receiving confirmation emails.
- **Evidence**: 
  - `ADR-010` notes: "The `9th-grade-ai` Vercel project had no `RESEND_API_KEY` and no SMTP config, so `hasEmailTransport()` returned `false` and every account auto-verified"
  - `backend/lib/email.ts` prioritizes SMTP → Resend → none, but none are configured in the default environment
- **Recommended Fix**:
  1. Configure SMTP (Gmail App Password works at $0 with no custom domain) or Resend API key
  2. Update `.env.local.example` with SMTP settings or clear instructions to obtain them
  3. Add visible notice when email transport is unavailable

### Status: **HIGH**
- **Problem**: Rate limiting for AI endpoints uses in-memory store which doesn't work across Vercel serverless instances. Each warm instance has its own counter, effectively multiplying the AI budget by instance count.
- **Evidence**: 
  - `ADR-0007` → `ADR-0009` documents the activation path: in-memory → Redis when `REDIS_URL` is set
  - `ADR-0009` states: "ioredis is now a runtime dependency. When `REDIS_URL` is set, `infrastructure/cache/index.ts` constructs `RedisRateLimitStore`"
  - Without Redis, per-instance counters mean a user on one instance can exceed quotas while others are unrestricted
- **Recommended Fix**:
  1. Set `REDIS_URL` (e.g., Upstash Redis) for production
  2. Or accept the limitation and document it for single-instance deployments
  3. The DB-backed `AIUsage` ledger provides some backstop but doesn't prevent quota exceeding in real-time

---

## 3. Data Quality & Question Bank Integrity

### Status: **CRITICAL**
- **Problem**: The question bank contains numerous data quality issues that would surface to users:
  - Unicode corruption (mojibake, visual-order Bengali, control characters)
  - Structural issues: <4 options, empty options, answers matching no option
  - Missing explanations (∼279 rows)
  - Duplicate options
  - Foreign script glyphs smuggled into Bangla text
- **Evidence**: 
  - `ADR-0015` documents the forensic audit: "2,700 MCQs, of which a material share were unusable"
  - `scripts/qb-forensics/index.ts` identified 293 stale/broken rows
  - The gate script `scripts/qb-forensics/import-gate.ts` exists but the live database may still contain bad data
  - 33 REVIEW rows remain for manual data fixes after the `math:heal` migration
- **Recommended Fix**:
  1. Run the cleanup sweep: `npm run qb:clean-broken:verify` then `npm run qb:clean-broken:apply`
  2. Verify the question bank has >2,400 clean questions before launch
  3. Add pre-commit hook to run the import gate on any new question imports

### Status: **HIGH**
- **Problem**: Math rendering is not fully complete. While significant progress has been made (KaTeX conversion, canonical pipeline), some rows still have legacy Unicode math that doesn't render book-exact, and the practice tab may show flat text for some math MCQs.
- **Evidence**: 
  - `ADR-028` through `ADR-031` document the math migration series
  - 33 REVIEW rows remain for manual data fixes after `math:heal`
  - Some math expressions still show inline divisions like `a/b` instead of `\frac{a}{b}`
  - The `quickNormalize` helper exists but may not cover all edge cases
- **Recommended Fix**:
  1. Run `npm run math:audit` and `npm run math:heal` to fix remaining rows
  2. Verify the practice tab renders math correctly for all question types
  3. Test PDF export with math content

---

## 4. Dashboard & User Experience

### Status: **CRITICAL**
- **Problem**: The dashboard was rebuilt per `ADR-010` to use real database data, but verification is needed. The old hard-coded stats (fake 91.6 points, fabricated rank/exams, static notifications) may still be present in some code paths.
- **Evidence**: 
  - `ADR-010` decision: "The dashboard is rebuilt as a 'mission control' surface fed exclusively by real endpoints"
  - However, the auto-verify email issue means many demo accounts may not have real progress data
  - Dashboard stats endpoint (`getDashboardStats`) depends on `userProgress` which may be empty for new users
- **Recommended Fix**:
  1. Verify all dashboard data comes from real API endpoints
  2. Ensure empty states are graceful when user has no data
  3. Test the full dashboard flow with a real user account

### Status: **HIGH**
- **Problem**: Three undocumented timer regimes exist (advance-only / deadline / local-lock) without user-visible labels, causing confusion about when answers are submitted or timed out.
- **Evidence**: 
  - `Pitfall Register P-U4`: "Three undocumented timer regimes... Users can't tell which rules apply"
  - Found in `PracticeTab:468-474`, `MockTab:423-436`, `RealExam:270-305`
- **Recommended Fix**:
  1. Add a one-line regime label per session header
  2. Document the timer rules in the UI help/tooltips

### Status: **MEDIUM**
- **Problem**: No difficulty picker in the onboarding/setup flow. Users can't match their skill level, even though the API supports difficulty filtering.
- **Evidence**: 
  - `Pitfall Register P-U3`: "Setup has no difficulty picker (all exam surfaces)"
  - API already supports it, but no UI input exists
- **Recommended Fix**:
  1. Add 3-chip picker (BEGINNER | INTERMEDIATE | ADVANCED) in onboarding
  2. Pass difficulty preference to question-bank APIs

### Status: **MEDIUM**
- **Problem**: Zero-history Home is honest but inert - disabled CTA and null recommendations mean new users see no activation path.
- **Evidence**: 
  - `Pitfall Register P-U5`: "Zero-history Home is honest but inert (disabled CTA, null recs)"
  - Weak activation, growth impact
- **Recommended Fix**:
  1. Add onboarding diagnostic mission fed by onboarding fields
  2. Make CTA functional even with minimal data (e.g., "Set your exam target first")

### Status: **MEDIUM**
- **Problem**: Leaderboard streak fan-out makes N extra queries per fetch, with a 30s cache that's "never read" per the pitfall register.
- **Evidence**: 
  - `Pitfall Register P-F1`: "Leaderboard streak fan-out (`content.ts:417`)"
  - Medium latency impact, read cache + slice recommended
- **Recommended Fix**:
  1. Ensure the 30s cache is actually being utilized
  2. Consider batching the streak computation

---

## 5. Frontend & Technical Debt

### Status: **HIGH**
- **Problem**: Sentry client includes 121 KB replay runtime even though `replaysSessionSampleRate: 0.1` means only 10% of sessions are recorded. This is the single largest removable blob.
- **Evidence**: 
  - `ADR-0013`: "Sentry client at ~285 KB parsed / 92 KB gzip... replay chunk was verified in the eager preload set of every route"
  - Decision: "Remove `replayIntegration` + `replaysSessionSampleRate` / `replaysOnErrorSampleRate` (deletes the 121 KB replay runtime)"
  - Despite this ADR, check if the replay code is actually still in the build
- **Recommended Fix**:
  1. Verify `frontend/lib/sentry.tsx` has replay and tracing removed per ADR-0013
  2. Re-run `npm run build` and check the bundle analyzer

### Status: **HIGH**
- **Problem**: Sub-44px interactive targets (w-8/w-9 steppers, modal closes) violate WCAG 2.5.6 (Target Size minimum 44x44px).
- **Evidence**: 
  - `Pitfall Register P-D1`: "Sub-44px interactive targets (`w-8/w-9` steppers incl. new dock, modal closes)"
  - Usability issue, WCAG fail
- **Recommended Fix**:
  1. Raise interactive targets to 44px minimum (Tailwind: `w-11 h-11` or `min-w-max`)
  2. Review modal close buttons and stepper controls

### Status: **HIGH**
- **Problem**: `useDialogA11y` hook adopted on only 7/13 dialogs. Practice and Custom confirm dialogs use it, but NotificationCenter lacks trap/restore.
- **Evidence**: 
  - `Pitfall Register P-D2`: "Accessibility · `useDialogA11y` on 7/13 dialogs"
  - Keyboard/focus loss a11y issue
- **Recommended Fix**:
  1. Adopt `useDialogA11y` on all remaining dialogs
  2. Ensure focus trap and restore on dialog close for all modal dialogs

### Status: **MEDIUM**
- **Problem**: Token bypasses via `CommandPalette`, `AppNavbar` black/white, raw `z-50/z-40` z-indices cause light-theme breakage.
- **Evidence**: 
  - `Pitfall Register P-D3`: "Token bypasses (`CommandPalette`, `AppNavbar` black/white, raw `z-50/z-40`)"
  - Consistency issue across themes
- **Recommended Fix**:
  1. Use design tokens consistently (`var(--z-*)` or theme-aware z-indices)
  2. Audit all component z-indices for theme consistency

---

## 6. Code Quality & Maintenance

### Status: **MEDIUM**
- **Problem**: Dead code: unreachable return block (prep-intel route), `NextBestAction` unmounted, causing confusion and false signals.
- **Evidence**: 
  - `Pitfall Register P-C3`: "Code health · Dead code: unreachable return block (prep-intel route), `NextBestAction` unmounted"
- **Recommended Fix**:
  1. Remove unreachable code
  2. Audit `preparation-intelligence.ts` for dead branches
  3. Run `npm run typecheck` to catch type errors

### Status: **MEDIUM**
- **Problem**: UTC `studiedToday` off-by-one near midnight Dhaka, causing spurious warmup recommendations.
- **Evidence**: 
  - `Pitfall Register P-C2`: "Data · UTC `studiedToday` off-by-one near midnight Dhaka · Spurious warmup rec"
- **Recommended Fix**:
  1. Fix the date key computation to account for Dhaka timezone (UTC+6)
  2. Test date boundary behavior

### Status: **LOW**
- **Problem**: No funnel events (activation, rec acceptance, drill completion) - can't measure what works.
- **Evidence**: 
  - `Pitfall Register P-N1`: "Analytics · No funnel events (activation, rec acceptance, drill completion)"
- **Recommended Fix**:
  1. Add event calls in recommendation handlers
  2. Track 6-8 named funnel events

---

## 7. Deployment & Infrastructure

### Status: **HIGH**
- **Problem**: No `REDIS_URL` set, meaning rate limits are per-instance and AI budgets are effectively unenforced on Vercel serverless.
- **Evidence**: 
  - `ADR-0009`: "Operators MUST set `REDIS_URL` in production (e.g., Upstash) for rate limits to be enforced across instances"
  - Without Redis, in-memory counters are per-process
- **Recommended Fix**:
  1. provision Redis (Upstash free tier available)
  2. Set `REDIS_URL` in production environment
  3. Test rate limiting across multiple warm instances

### Status: **MEDIUM**
- **Problem**: `nodemailer` dependency installed but no SMTP/Resend config means email verification auto-silently succeeds.
- **Evidence**: 
  - `ADR-010`: "When no transport is configured, the app keeps the documented auto-verify fallback so accounts are never locked out"
  - But this means no real verification emails are sent
- **Recommended Fix**:
  1. Configure SMTP (Gmail App Password) or Resend API key
  2. Test the full email verification flow end-to-end

### Status: **LOW**
- **Problem**: `hasNonStandardSpace` used a stateful `/g` regex, so boolean checks now use a non-global copy.
- **Evidence**: 
  - `ADR-0015` addendum: "fixed a latent bug: `hasNonStandardSpace` used a stateful `/g` regex"
- **Recommended Fix**: 
  1. Verify the fix is in place
  2. Run relevant tests

---

## 8. Test Coverage Gaps

### Status: **MEDIUM**
- **Problem**: Test coverage may be incomplete for new features. The project requires `npm run test` before committing, but new AI features may not have adequate tests.
- **Evidence**: 
  - `AGENTS.md` testing requirements: "All new features require at least a component test in `tests/`"
  - API routes should have integration tests in `tests/api/`
- **Recommended Fix**:
  1. Run `npm run test` and verify all tests pass
  2. Add component tests for new AI features
  3. Add API route integration tests

### Status: **MEDIUM**
- **Problem**: No e2e tests run as part of the standard test command without Playwright setup.
- **Evidence**: 
  - `npm run test:e2e` requires Playwright browsers to be installed
- **Recommended Fix**:
  1. Ensure Playwright browsers are installed (`npx playwright install`)
  2. Run `npm run test:e2e` to verify critical user flows

---

## 9. Summary of Severity Distribution

| Severity | Count | Issues |
|----------|-------|--------|
| **Critical** | 4 | Email verification non-functional, AI keys/mock fallbacks, Question bank data quality, Dashboard data integrity |
| **High** | 8 | Rate limiting multi-instance, Sentry replay size, Sub-44px targets, useDialogA11y adoption, Math rendering completeness, Timer regimes, Difficulty picker, Voice input/output |
| **Medium** | 7 | Leaderboard query optimization, Code dead zones, UTC date off-by-one, Token bypasses, Funnel events, Import gate wiring, Test coverage |
| **Low** | 2 | Stateful regex bug, No funnel event tracking |

---

## Immediate Action Items (Launch-Blockers)

1. **🔴 Configure email transport** (SMTP or Resend) so accounts receive real verification emails
2. **🔴 Run question bank cleanup** (`npm run qb:clean-broken:verify` then `--apply`) to remove broken MCQs
3. **🔴 Set REDIS_URL** for proper rate limiting across Vercel instances, or document the limitation
4. **🔴 Configure AI API keys** (GROQ_API_KEY at minimum) or add prominent "AI features disabled until keys are set" messaging
5. **🔴 Verify Sentry config** has replay/tracing removed per ADR-0013
6. **🔴 Fix sub-44px interactive targets** for WCAG compliance
7. **🔴 Adopt useDialogA11y** on all remaining dialogs

## Post-Launch Deferred Items

1. Math rendering completeness (33 REVIEW rows)
2. Timer regime labeling
3. Difficulty picker in onboarding
4. Funnel event analytics
5. Full Tavily web search grounding
6. Leaderboard cache optimization
7. Voice input/output robust handling

---
*Document generated from comprehensive codebase scan on 2026-11-19. Covers pitfalls from `PITFALL_REGISTER.md`, `DECISIONS.md` (ADRs), `AI-SYSTEM.md`, `AGENTS.md`, and direct code analysis.*