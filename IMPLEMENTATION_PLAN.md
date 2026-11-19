# Implementation Plan: First Release Fixes

## Plan Overview
This plan addresses all 22 identified pitfalls from the deep dive analysis, organized by priority and dependency. Following the project's change workflow (UNDERSTAND → INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → DOCUMENT).

> **Update 2026-11-19 → 2026-11-20 — Phase status**: P0 DONE; P1–P3 DONE (startup warnings); P4 DONE — **staged** + repaired (ADR-074 re-scoped dedupe to `(subjectId, path)`); P5/P8 DONE; P6 DONE (WCAG 44px); P7 DONE (dialog a11y verified); P13 DONE (Asia/Dhaka); P14 DONE (dead sentry removed). **Phase 1 shipped as commits `7ec4151`** (+ follow-ups `d7e87a2`).
>
> **Phase 2 status (2026-11-20)**: P10 DONE (`d738065` — timer regimes labeled); P11 DONE (`90d7af5` — custom-exam difficulty band); P12 verified already fixed (batched `computeStreaks`); P15 DONE (funnel events wired); P16 verified already fixed (stateful `/g` regex gone). **P9 (math heal) apply pending** — interactive-transaction timeout raised to 30min; retry in flight (DB connectivity blip hit on first retry attempt). Phase 2 essentially complete; remaining: P9 heal fixpoint + final wrap-up.

---
## Phase 1: Critical Blockers (Launch-Blocking - Must Complete Before Release)

### P0: Domain-Event Subscribers Lost From Server Startup (NEW — Critical, found during Phase 1)
**Severity**: Critical | **Effort**: 2 hours

**Context**: Commit `fbab8e2` replaced the `instrumentation.ts` `register()` hook (which imported +
called `registerSubscribers()`) with a bare `Sentry.init`. Result: badges, learning events, and
event-driven notifications never fired in production.

**Fix Applied**:
1. `instrumentation.ts` — restored `export async function register()` (nodejs-only) calling
   `registerSubscribers()` + startup checks.
2. `backend/lib/startup-checks.ts` — NEW: email transport / AI keys / REDIS startup warnings.
3. `tests/unit/backend/startup-checks.test.ts`, `tests/unit/backend/instrumentation-register.test.ts` — 13 tests.

**Status**: ✅ DONE.

---

### P1: Email Verification Non-Functional
**Severity**: Critical | **Effort**: 2-3 hours

**Dependencies**: 
- Access to SMTP service or Resend API key
- Environment configuration

**Changes Required**:
1. `backend/lib/email.ts` - Already supports SMTP→Resend→none priority; needs env vars configured
2. `.env.local.example` - Add SMTP settings or Resend key with clear instructions
3. Add startup warning when no email transport configured

**Implementation**:
```bash
# Option A: Gmail SMTP (free, no custom domain)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password  # Gmail App Password

# Option B: Resend
RESEND_API_KEY=re_ABC123...
```

**Verification**: 
- Run `npm run secret-scan` to ensure no secrets committed
- Test signup flow: verify email arrives
- Check `hasEmailTransport()` returns true

---

### P2: AI Features Require API Keys
**Severity**: Critical | **Effort**: 1-2 hours

**Dependencies**: 
- GROQ_API_KEY (minimum for mock fallback to be useful)
- ANTHROPIC_API_KEY (for full AI features)

**Changes Required**:
1. `backend/rate-limit.ts` - Already has `checkDailyCostBudget`; ensure defaults work
2. Add startup warning in `app/layout.tsx` or root layout
3. Gate AI feature visibility: hide tutor/solver cards when no keys set
4. `frontend/lib/services/ai/types.ts` - Document required keys

**Implementation**:
1. Add env check at app startup
2. Show banner: "AI features enabled when GROQ_API_KEY is set"
3. Keep mock fallback working for development

**Verification**:
- Run app without API keys → see warning banner
- Run app with GROQ_API_KEY → AI features functional
- Verify mock `source: "mock"` responses still work

---

### P3: Rate Limiting Per-Instance Limitation
**Severity**: Critical | **Effort**: 30-45 minutes (config) or 2-3 hours (Redis setup)

**Dependencies**: 
- Redis instance (Upstash free tier available)
- `REDIS_URL` environment variable

**Changes Required**:
1. `backend/infrastructure/cache/rate-limit-store.ts` - Already has Redis-compatible store
2. `infrastructure/cache/index.ts` - Construct RedisRateLimitStore when REDIS_URL set
3. `.env.production` - Set REDIS_URL
4. Or document limitation for single-instance deployments

**Implementation Path A (Recommended)**:
1. Sign up for Upstash Redis (free tier)
2. Set REDIS_URL in production environment
3. Verify rate limits work across multiple warm instances

**Implementation Path B (Fallback)**:
1. Add documentation note about per-instance limitation
2. Accept that AI budgets may be higher on Vercel due to instance count
3. Rely on DB-backed AIUsage ledger for cost tracking

**Verification**:
- With REDIS_URL: test rate limiting across multiple requests
- Without REDIS_URL: verify in-memory store works for single-user dev

---

### P4: Question Bank Data Corruption
**Severity**: Critical | **Effort**: 1-2 hours

**Status**: ✅ STAGE 1 DONE (2026-11-19) — **9,744 rows deleted** (DUPLICATE 9,642 + UNICODE_CORRUPTION 41 + EMPTY_EXPLANATION 61); 4,986 structural rows deferred.

**Outcomes**:
- The dry-run flagged **14,730 of 47,175 rows (31%)** — far above the ~293 in this plan.
- Added `--reasons=` staged-run support (pure filter + unit tests).
- Applied with pg_dump backup (`PG_DUMP_BIN` override for v18-vs-v16 client/server mismatch).
- **Cross-ecosystem damage repaired**: 9,142 CROSS_SUBJECT + 313 PATH_DUP rows restored from the
  pre-deletion dump; 82 UserQuestionProgress rows re-inserted; 86 QuestionAttempt FKs re-linked.
- Post-restore question count: **46,886** (= 47,175 − 187 true double-imports − 102 corrupt/empty).

**Follow-ups**:
- Stage 2: clear 4,458 STRUCTURAL_BROKEN `ANSWER_MISMATCH` rows (letter-prefixed answers like `"d. 3"`).
- Re-run `qb:clean-broken:verify` before declaring the bank clean.

**Dependencies**: 
- Database access (PostgreSQL via DATABASE_URL)
- Backup of existing data

**Changes Required**:
1. Run cleanup sweep:
   ```bash
   npm run qb:clean-broken:verify    # Dry-run first
   npm run qb:clean-broken:apply     # Apply changes
   ```
2. Verify count: should go from ~2,700 to ~2,407 clean questions
3. Run gate check:
   ```bash
   npx tsx scripts/qb-forensics/index.ts
   ```

**Changes Required** (if manual fixes needed):
1. `scripts/qb-forensics/import-gate.ts` - Ensure gate is enforced on all imports
2. `scripts/clean-broken-questions.ts` - Verify sweep logic

**Verification**:
- Run `npm run db:seed` and check question count
- Verify no broken MCQs remain (run `npm run math:audit`)
- Test practice tab with cleaned question bank

---

### P5: Sentry Replay Runtime Bloat
**Severity**: High | **Effort**: 30 minutes

**Dependencies**: 
- Access to `frontend/lib/sentry.tsx`
- Build tools to verify bundle size

**Changes Required**:
1. Per `ADR-0013`: Remove replay and tracing from Sentry config
2. `frontend/lib/sentry.tsx` - Remove:
   - `replayIntegration` 
   - `replaysSessionSampleRate` / `replaysOnErrorSampleRate`
   - `browserTracingIntegration` + `tracesSampleRate`
   - Unused `onRouterTransitionStart` export
3. Keep: `Sentry.init` for error events + breadcrumbs + context

**Implementation**:
1. Edit `frontend/lib/sentry.tsx` per ADR-0013 guidelines
2. Rebuild: `npm run build`
3. Check analyzer: `ANALYZE=true npm run build`
4. Verify replay chunk absent from built bundles

**Verification**:
- `npm run analyze` → check Sentry client size (~50 KB gzip vs ~171 KB with replay)
- `window.chartData` → verify no `replay` chunk
- Manual inspection of built JS

---

### P6: WCAG Sub-44px Interactive Targets
**Severity**: High | **Effort**: 1-2 hours

**Dependencies**: 
- Component library review
- Tailwind CSS v4 utility classes

**Changes Required**:
Identify all interactive targets < 44px and raise to minimum:

1. **Steppers** (`w-8`/`w-9`): → `w-11` (44px = w-11 in Tailwind)
2. **Modal close buttons**: → `w-10 h-10` or `min-w-max min-h-max`
3. **Action buttons**: Review all `px-*`/`py-*` rounded buttons
4. **Link targets**: Ensure touch targets meet 44px

**Implementation**:
1. Grep for `w-8` and `w-9` in frontend components
2. Review all modal close/X buttons
3. Review stepper controls in practice/exam tabs
4. Update Tailwind classes to minimum `w-11 h-11` (44×44px)
5. Run `npm run lint` to check for CSS violations

**Verification**:
- Manual inspection on mobile viewport
- Measure touch targets with dev tools
- Run `npm run lint:ui` if UI lint rules exist

---

### P7: Accessibility - Dialog Focus Management
**Severity**: High | **Effort**: 2-3 hours

**Dependencies**: 
- `useDialogA11y` hook location
- All dialog components in the codebase

**Changes Required**:
1. Adopt `useDialogA11y` on all 13 dialogs
2. Ensure focus trap and restore on dialog close

**Implementation**:
1. Locate all dialogs in `frontend/components/dashboard/`:
   - PracticeTab, CustomExamTab, NotificationCenter, etc.
2. Import `useDialogA11y` from `~frontend/lib/a11y`
3. Wrap each dialog with focus management:
   ```tsx
   useDialogA11y(dialogRef, {
     onEscapeKey: () => closeDialog(),
     onOutsidePointerDown: () => closeDialog(),
   })
   ```
4. Ensure focus returns to opener on close

**Dialogs to fix** (per `Pitfall Register P-D2`):
- NotificationCenter (lacks trap/restore)
- Any remaining dialogs without the hook

**Verification**:
- Open/close each dialog with keyboard (Esc, Tab)
- Verify focus traps work
- Verify focus returns on close
- Run accessibility tests if available

---

### P8: Sentry Tracing Removal (Bonus Bundle Optimization)
**Severity**: High | **Effort**: 30 minutes (combined with P5)

**Dependencies**: 
- Already addressed in P5 partially

**Changes Required**:
Remove `browserTracingIntegration` and `tracesSampleRate` per ADR-0013:
- This deletes ~25-35 KB per page of browser tracing/metrics
- Combined with replay removal: ~150+ KB total savings

**Implementation**:
- Included in P5 changes (same file edits)
- Verify both replay AND tracing removed

---

## Phase 2: High-Priority but Post-Launch Deferrable

### P9: Math Rendering Completeness
**Severity**: High | **Effort**: 2-3 hours

**Dependencies**: 
- Database with math questions
- `npm run math:audit` / `npm run math:heal` scripts

**Changes Required**:
1. Run audit: `npm run math:audit`
2. Run heal: `npm run math:heal` (dry-run default)
3. If `--apply`: `npm run math:heal:apply` (with backup!)
4. Verify: `npm run math:audit` shows `clean=13013, healed=0`

**Implementation**:
1. **Backup first**: `pg_dump 9th_grade_ai_prod > backup_20261119.sql`
2. Run dry-run: `npm run math:heal` 
3. Review what would be healed (REVIEW rows identified)
4. Apply if satisfactory: `npm run math:heal:apply`
5. Re-audit to fixpoint: exit 1 if HEALED > 0

**Verification**:
- `npm run math:audit` → shows clean=13013, healed=0
- 0 REVIEW rows remaining (or only known-broken ones)
- Practice tab renders math correctly

---

### P10: Timer Regime Labeling
**Severity**: High | **Effort**: 1-2 hours

**Dependencies**: 
- PracticeTab, MockTab, RealExam components
- Timer logic understanding

**Changes Required**:
1. Identify the three regimes in:
   - `PracticeTab:468-474` 
   - `MockTab:423-436`
   - `RealExam:270-305`
2. Add one-line regime label per session header
3. Document rules in UI tooltips if needed

**Implementation**:
1. Examine timer state in each tab component
2. Add label component (e.g., `<TimerLabel regime={regime} />`)
3. Pass regime from session state
4. Display: "Advance-only" / "Deadline" / "Local-lock"

**Verification**:
- Each timer session shows regime label
- Labels match the actual timer behavior
- No regressions in exam functionality

---

### P11: Difficulty Picker in Onboarding
**Severity**: High | **Effort**: 2-3 hours

**Dependencies**: 
- Onboarding flow components
- API already supports difficulty

**Changes Required**:
1. Add 3-chip picker (BEGINNER | INTERMEDIATE | ADVANCED) in onboarding setup
2. Store preference in user profile (`prepLevel` field already exists)
3. Pass difficulty to question-bank APIs

**Implementation**:
1. Examine `onboarding/` directory for existing setup flow
2. Add difficulty selector component
3. On submit, call `completeOnboarding()` with `prepLevel`
4. Update APIs to filter by user's `prepLevel` if not set, show all

**Verification**:
- Onboarding flow has 3-chip picker
- User can select and save difficulty level
- Question bank filters by difficulty preference

---

### P12: Leaderboard Query Optimization
**Severity**: Medium | **Effort**: 1-2 hours

**Dependencies**: 
- `content.ts` leaderboard logic
- Query cache implementation

**Changes Required**:
1. Per `Pitfall Register P-F1`: "Leaderboard streak fan-out (`content.ts:417`)"
2. Ensure 30s cache is actually being utilized
3. Consider batching streak computation
4. May need to reduce `computeStreaks` query cost

**Implementation**:
1. Examine `backend/services/content.ts:417` leaderboard code
2. Verify `QueryCache.getLeaderboard(limit)` is being called
3. Check if cache key includes userId or is global
4. If global cache: consider per-user caching with shorter TTL

**Verification**:
- `npm run test` passes
- Dashboard loads leaderboard within acceptable time
- Cache hit/miss ratio acceptable

---

### P13: UTC Date Off-by-One (Dhaka Midnight)
**Severity**: Medium | **Effort**: 1 hour

**Dependencies**: 
- `preparation-intelligence.ts` date logic
- `studiedToday` field computation

**Changes Required**:
1. Per `Pitfall Register P-C2`: "UTC `studiedToday` off-by-one near midnight Dhaka"
2. Dhaka is UTC+6, so midnight local = 18:00 UTC previous day
3. Fix date key computation to account for timezone

**Implementation**:
1. Locate `studiedToday` computation in `preparation-intelligence.ts`
2. Identify the off-by-one logic
3. Adjust to use user's local timezone or adjust UTC offset
4. Test date boundary: day before/after midnight Dhaka time

**Verification**:
- Test user activity at 23:59 and 00:01 Dhaka time
- Verify `studiedToday` flag correct
- Run `npm run test` to ensure no regressions

---

### P14: Code Dead Zones Removal
**Severity**: Medium | **Effort**: 1-2 hours

**Dependencies**: 
- `prep-intel` route
- `NextBestAction` component

**Changes Required**:
1. Per `Pitfall Register P-C3`: "Dead code: unreachable return block (prep-intel route), `NextBestAction` unmounted"
2. Remove unreachable code blocks
3. Audit `preparation-intelligence.ts` for dead branches
4. Remove or fix `NextBestAction` if unmounted

**Implementation**:
1. Search for "unreachable" or dead return blocks
2. Remove or restructure dead code
3. Check `NextBestAction` usage and either remove or fix
4. Run `npm run typecheck` to verify no type errors

**Verification**:
- `npm run typecheck` passes
- `npm run lint` passes
- No console errors from removed code

---

### P15: Funnel Event Analytics
**Severity**: Low | **Effort**: 2-3 hours

**Dependencies**: 
- Event tracking infrastructure
- Analytics dashboard

**Changes Required**:
1. Per `Pitfall Register P-N1`: "No funnel events (activation, rec acceptance, drill completion)"
2. Add event calls in recommendation handlers
3. Track 6-8 named funnel events
4. Wire to existing analytics or add lightweight tracking

**Implementation**:
1. Identify key user flows: activation, recommendation acceptance, drill completion
2. Add `learningEvents` entries via `POST /api/learning-events`
3. Or add custom analytics events
4. Ensure events persist and are queryable

**Verification**:
- Events appear in database after user interactions
- Can query events by type
- No performance impact from event logging

---

### P16: Stateful Regex Bug Fix (Legacy)
**Severity**: Low | **Effort**: 15 minutes

**Dependencies**: 
- `scripts/qb-forensics/unicode.ts` 
- Import gate logic

**Changes Required**:
Per `ADR-0015` addendum: "fixed a latent bug: `hasNonStandardSpace` used a stateful `/g` regex"

**Implementation**:
1. Check `scripts/qb-forensics/unicode.ts` for stateful regex
2. Fix to use non-global regex copy for boolean checks
3. Verify the fix doesn't break import gate

**Verification**:
- `npm run qb:forensics` runs correctly
- Import gate still rejects/accepts correctly
- No regressions in question bank operations

---

## Phase 3: Maintenance & Polish

### P17: Email Transport Production Setup
**Severity**: Critical (ongoing) | **Effort**: Ongoing

**Dependencies**: 
- Production environment configuration
- Domain verification (for Resend) or Gmail account

**Changes Required**:
1. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in production `.env`
2. Or set `RESEND_API_KEY` with verified sending domain
3. Test end-to-end email verification flow

**Verification**:
- New user signs up → receives verification email
- User clicks → email verified in database
- Unverified user cannot access protected routes

---

### P18: REDIS_URL Production Setup
**Severity**: High (ongoing) | **Effort**: Ongoing

**Dependencies**: 
- Redis instance production configuration
- Rate limit enforcement

**Changes Required**:
1. Provision Redis (Upstash, Redis Labs, etc.)
2. Set `REDIS_URL` in production environment
3. Test rate limits across multiple Vercel invocations
4. Monitor rate limit store health

**Verification**:
- Multiple warm instances share same rate limit counters
- AI quotas enforced per-user not per-instance
- No 429 errors from misconfigured limits

---

### P19: AI Keys Rotation & Monitoring
**Severity**: Medium (ongoing) | **Effort**: Ongoing

**Dependencies**: 
- API key management
- Cost monitoring

**Changes Required**:
1. Set up API key rotation schedule
2. Monitor AI usage via `AIUsage` table
3. Set up alerts when daily cost approaches budget
4. Document key management procedure

**Verification**:
- Daily cost ≤ budget set in `.env`
- Usage summary accessible via `/api/ai/usage/summary`
- No surprise cost overruns

---

### P20: Documentation Updates
**Severity**: Medium | **Effort**: 1-2 hours

**Dependencies**: 
- `DECISIONS.md`, `API.md`, `DATABASE.md` updates

**Changes Required**:
1. Update `docs/API.md` if any API behaviors change
2. Update `docs/DATABASE.md` if schema changes
3. Add notes about configured env vars in `docs/DEPLOYMENT.md`
4. Update any ADRs if decisions change

**Verification**:
- All changed docs committed with PR
- No outdated documentation
- New developers can onboard from docs alone

---

## Execution Timeline

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Phase 1** (Critical) | P1-P5 | 4-6 hours |
| **Phase 2** (High) | P6-P11 | 8-12 hours |
| **Phase 2** (Medium) | P12-P16 | 5-8 hours |
| **Phase 3** (Ongoing) | P17-P20 | Ongoing |

## Success Criteria (Launch-Go)

All **Critical** pitfalls resolved:
- [ ] Email verification works (users receive real confirmation emails)
- [ ] AI features have clear status (keys set → functional; no keys → gated with warning)
- [ ] Rate limits enforced (Redis configured or documented limitation accepted)
- [ ] Question bank clean (≥2,400 usable questions, 0 broken MCQs)
- [ ] Sentry bundle optimized (replay + tracing removed, ~150 KB savings)

All **High** pitfalls resolved:
- [ ] WCAG 2.5.6 compliance (44px minimum touch targets)
- [ ] All dialogs have focus management (useDialogA11y)
- [ ] Math rendering complete (0 REVIEW rows, book-exact KaTeX)
- [ ] Timer regimes labeled (visible per session)
- [ ] Difficulty picker in onboarding

Then **launch**. Remaining items are post-launch improvements.

---
*Plan generated from DEEP_DIVE_FIRST_RELEASE_PITFALLS.md and SUMMARY.md analysis.
Follow project change workflow: UNDERSTAND → INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → DOCUMENT.*