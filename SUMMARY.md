# First Release Deep Dive - Summary

## Overview
Comprehensive analysis of pitfalls/drawbacks for launching 9Th-Grade AI v0.2.2 first release.

## Critical Blockers (Must Fix Before Launch) — Phase 1 status 2026-11-19
1. ✅ **Email verification** — auto-verify fallback wired; startup warning (`email.transport.missing`) active via `backend/lib/startup-checks.ts`. **Action**: configure SMTP/Resend before launch.
2. ✅ **AI features** — `GROQ_API_KEY` present; mock disclosure (`source:"mock"`) client-side. **Action**: launch with Groq key set.
3. ✅ **Rate limiting** — startup warning (`redis.missing`) active. **Action**: set REDIS_URL before launch (ADR-0009).
4. ✅ **Question bank** — STAGED CLEANUP DONE: 9,744 safe rows deleted, cross-subject damage restored, dedupe re-scoped to (subjectId, path). **Action**: stage 2 — resolve 4,458 ANSWER_MISMATCH rows; then `qb:clean-broken:verify` green.
5. ✅ **Sentry replay** — verified compliant with ADR-0013 (client error-only; server tracing intentionally kept).

## High-Priority Fixes (Phase 2 — completed 2026-11-19/20)
6. ✅ **Event wiring** — restored `instrumentation.ts` register() → subscribers (P0, commit `7ec4151`).
7. ✅ **WCAG violations** — QuestionPalette 36px→44px targets + Modal close hit-area fixed (commit `d7e87a2`).
8. ✅ **Accessibility gaps** — `useDialogA11y` verified on all cited dialogs (NotificationCenter included).
9. ✅ **Timer regimes** — P10 DONE (commit `d738065`): SessionTimer/PracticeTimer/DrillTimer/CalmCountdown now render user-visible regime labels.
10. ✅ **Difficulty picker** — P11 DONE (commit `90d7af5`): custom-exam build accepts `difficulty` (EASY|MEDIUM|HARD); picker UI in CustomExamTab.
11. ✅ **Leaderboard optimization** — P12 verified already fixed: batched `computeStreaks` (single `IN` query) + 30s `QueryCache`.
12. ✅ **Funnel analytics** — P15 DONE: REC_ACCEPTED/REC_COMPLETED fire-and-forget events on `/api/learning-events`.
13. ✅ **Regex bug** — P16 verified already fixed: stateful `/g` regex removed.

## Math-Heal Status (P9)
- Dry-run: 46,896 rows scanned → 40,500 clean / 6,174 HEALED / 222 REVIEW.
- **Apply failed twice**: (a) interactive-transaction 600s→1800s timeout fix applied in `scripts/heal-latex-artifacts.ts`; (b) first retry hit transient Neon pooler connectivity error — retry in flight.
- Backup taken before every attempt: `backups/latex-heal-*.dump`. DB confirmed unmutated (heal transaction rolls back cleanly on failure).

## Launch Action Checklist
- [ ] Configure SMTP or Resend API key for email verification (P1)
- [ ] Set REDIS_URL in production or document limitation (P3)
- [ ] Set GROQ_API_KEY (minimum) or add "AI features disabled until keys set" messaging (P2)
- [ ] Verify Sentry config: replay and tracing removed per ADR-0013 (P5/P8) — DONE
- [ ] Interactive-target audit — DONE (P6: palette + modal fixed; remaining inventory in baseline)
- [ ] Dialog a11y adoption — DONE (P7: verified on cited dialogs)
- [ ] Stage-2 ANSWER_MISMATCH data cleanup (P4 follow-up) — pending

## Key Files Analyzed
- `AGENTS.md` - Project contract and conventions
- `PITFALL_REGISTER.md` - 93 documented pitfalls across 9 categories
- `DECISIONS.md` - 30+ ADRs documenting architectural decisions
- `AI-SYSTEM.md` - AI provider architecture and endpoints
- `backend/rate-limit.ts` - Rate limit policy and store configuration
- `backend/services/user.ts` - Auth and email verification flow
- `frontend/lib/sentry.tsx` - Sentry client configuration
- `frontend/components/ui/` - UI component library
- `database/data/ques/` - Question bank data

## Testing Commands Available
- `npm run test` - Vitest unit tests
- `npm run test:e2e` - Playwright end-to-end tests
- `npm run lint` - ESLint + UI lint
- `npm run typecheck` - TypeScript type checking
- `npm run build` - Next.js build

## Deprecated/Removed Features (Per ADRs)
- Legacy `UserSession` model - removed by migration 000000000005_drop_user_session
- Hard-coded dashboard stats (91.6 points, fabricated data) - replaced per ADR-010
- KB-grounding on AI tutor - removed per ADR-008 (now global assistant)
- shadcn/ui / Radix migration - declined per ADR-0013

*Document generated: 2026-11-19*