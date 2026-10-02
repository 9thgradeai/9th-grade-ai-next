# Transformation Summary — 9Th-Grade AI Deep Audit (Oct 2026)

Consolidation note (§42): all 10 deliverables exist. Maturity scorecards (§35) live inside the
three audit docs (UX strand in `DASHBOARD_UX_AUDIT.md`, technical strand in
`DASHBOARD_ARCHITECTURE_AUDIT.md`, intelligence strand in `AI_PRODUCT_AUDIT.md`) instead of a
separate file, to keep each score next to its evidence. Maturity scores (§35) live inside the
three audit docs (UX strand in `DASHBOARD_UX_AUDIT.md`, technical strand in
`DASHBOARD_ARCHITECTURE_AUDIT.md`, intelligence strand in `AI_PRODUCT_AUDIT.md`) instead of a
separate file, to keep each score next to its evidence.

## 1. Executive summary

The product is a **well-engineered reactive study platform, not yet an intelligent one**. Backend
fundamentals are strong (idempotent exam core, per-route auth, validation single-source, DB-side
aggregates, resilient AI router with quotas). The gaps that block "20×": the learning loop breaks
at results (dead ends), recommendations drop intent, Home is inert for new users, AI only answers
when asked, and two security/cost holes (notification IDOR, unthrottled vocab LLM) needed immediate
closure. Six fixes implemented + tested; roadmap phases 1–5 sequenced behind analytics events.

## 2. Current product reality

Single-URL dashboard (`/dashboard?tab=`, 11 tabs), BCS/Bank ecosystems, PYQ bank + practice/mock/
custom/real-exam surfaces, SRS flashcards + vocab, study planner, mistakes notebook, 14 AI endpoints
with versioned prompts + hybrid retrieval + memory + quotas, BYOS Drive sync. Honest loading/empty/
error states throughout; Bengali-first copy; token-based theming.

## 3. Biggest UX problems

P-U5 zero-history Home inert; P-U1 rec intents dropped (fixed); P-U2 result dead-ends (fixed);
P-U3 no difficulty control; P-U4 three undocumented timer regimes; IA1 11 overlapping tabs;
P-D1 sub-44px targets; P-D2 6 dialogs lack focus trap.

## 4. Biggest technical problems

P-F2 exam-submit mastery loop inside `Serializable` txn (first scale ceiling); P-F1 leaderboard
fan-out (fixed via 30s cache); P-B1 dual submit validators; P-B2 legacy non-idempotent submit path
(unrouted — delete next); P-C2 UTC-day framing near midnight Dhaka (needs `AT TIME ZONE` rework,
deliberately not patched).

## 5. Biggest AI problems

Reactive-only (AI1); rule recs with no acceptance learning (AI2); 6-line memory instead of episodic
topic history (AI3); agent blocks not executable (AI4); ungrounded mock gen (AI5); no live-traffic
eval loop (AI6). Orchestration-layer design in `AI_PRODUCT_AUDIT.md`: deterministic diagnosis →
fast-tier narration → executable action → acceptance logging.

## 6. Biggest product opportunities

O1 diagnostic mission, O2 unbroken intents (done), O3 result→mistake loop (done), O4 revision strip,
O5 difficulty matching, O6 AI Study Brief (numbers deterministic), O7 mistake-drills, O8 readiness
model, O9 weakness heatmap, O10 acceptance learning (events first).

## 7. 20× vision

`20X_PRODUCT_VISION.md`: Experience (one brief, one mission, one strip) / Intelligence (expected-value
ranker) / Learning Engine (decay, calibration, interleaving) / AI (verbs not chats) / Data (collect
only what changes a decision) / Infrastructure (keep the seam, batch the txn).

## 8. Transformation architecture

Keep thin-route/service/repository + idempotent exam core + token system. Add: decision-engine
service beside prep-intelligence, rec-funnel events, batch mastery writes, FTS at 10× content.
`DO_NOT_BUILD.md` guards the rest (no omnipresent chat, no generative metrics, no rewrite).

## 9. Highest-priority improvements (status)

Done: P-S1, P-S2, P-U1, P-U2, P-F1, P-C3. Next: P-B1, P-B2, O1, O3-extended, P-D1/P-D2, O5, events (P-N1).

## 10. Changes implemented (this phase)

| File | Change |
|---|---|
| `app/api/notifications/[id]/route.ts` | DELETE → `deleteUserNotification(userId, id)`; contract `{deleted:true}` preserved |
| `backend/services/notification.ts` | Removed unsafe `deleteNotification` (sole caller migrated) |
| `app/api/ai/vocab/route.ts` | `enforceAiQuotas(request, "solver", userId)` |
| `frontend/components/dashboard/HomeTab.tsx` | Rec intents carried (`mock`/`quick`); `startDailyWarmup`; mock resume |
| `frontend/components/dashboard/PracticeTab.tsx` | Result CTA "ভুলগুলো পর্যালোচনা করুন" → mistakes tab with subject intent |
| `backend/services/content.ts` | Leaderboard reads 30s cache (`me` always live); extracted `leaderboardMe` |
| `app/api/preparation-intelligence/route.ts` | Removed unreachable duplicate block |
| `tests/api/notifications-delete.test.ts` | 5 regression tests (401/400/own/other/global) |
| `docs/*.md` | 10 audit artifacts |

Deliberately NOT changed: UTC-day analytics (needs timezone-coherent rework, roadmap Phase 0).

## 11. Tests

- `npx vitest run tests/api/notifications-delete.test.ts` — 5/5 pass.
- `npx vitest run tests/api/{routes,preparation-intelligence.routes,vocab,exam-submit.routes}.test.ts
  tests/NewFeatures.test.tsx` — 97/97 pass.
- `npx vitest run tests/unit/frontend/{practice-start-dock,subject-topic-select}.test.tsx` — 13/13 pass.
- `npm run test` (full) — 1332/1336 pass. The 4 failures (`tests/qb-import-bank.test.ts`
  Bank subject classification) are **pre-existing**: they fail identically on a clean stash and live
  in import-classification code this phase never touched. My cache change initially broke 1
  leaderboard isolation test; fixed by resetting the query cache in `beforeEach`.
- `npm run typecheck` — clean. ESLint: 0 errors (warnings pre-existing).

## 12. Remaining risks

- Exam-submit txn abort under 200-Q burst load (P-F2) — monitor P2034 rate; batch next.
- Legacy `submitCustomExam` unreferenced but present — delete in Phase 0 with CI grep gate.
- Mock quota on vocab shares the `solver` bucket — split into a `vocab` bucket if limits bite.
- FTS absent — fine at current scale; revisit at 10× content.

## 13. Recommended next build phase

Phase 0 leftovers (validators, legacy delete, Dhaka-tz) → O1 diagnostic mission + O5 difficulty
picker (both small, high activation value) → rec-funnel events (unlocks all of Phase 2+) → O4
revision strip → O6 brief. Then Phase 3 AI per `AI_PRODUCT_AUDIT.md` §contextual opportunities.
