# Pitfall Register — 9Th-Grade AI

Format: ID / Category / Location / Current Behavior / Why / Impact / Severity / Evidence /
Recommended Fix / Dependencies / Complexity.

---

**P-S1** · Security · `app/api/notifications/[id]/route.ts:27` → `backend/services/notification.ts:193-210`
· DELETE calls `deleteNotification(id)` with no userId · Any session can delete any notification
incl. global broadcasts · Integrity + availability · Critical · Route passes only `notificationId`;
safe sibling `deleteUserNotification(userId, id)` exists unused · Route to `deleteUserNotification`
· None · Trivial.

**P-S2** · Security/Cost · `app/api/ai/vocab/route.ts:55-113` · No `enforceAiQuotas`; each call fans
out to LLM · Single account can loop unbounded spend · Cost abuse · High · Sibling routes all call
`enforceAiQuotas` · Add guard (`solver` bucket) · None · Trivial.

**P-U1** · UX · `HomeTab.tsx:338-344,512,579` · 5 rec intents + mission/continue quiz CTAs drop context,
landing on default custom mode · Recommendation promises unkept; extra taps · Engagement · High ·
Handler code; `PracticeTab` default `mode:"custom"` · Carry `{mode}` intent (quiz→quick, resume→mock)
· practiceIntent consumer exists · Small.

**P-U2** · UX · `PracticeTab.tsx:851-875` · Result panel dead-ends (retry/new only) · Post-effort moment
wasted; mistakes not routed to review · Learning loop · High · No mistakes-tab link in result JSX ·
Add `[Review N mistakes]` + `[Retry weak topics]` CTAs · `mistakeIntent`, router tab nav · Small.

**P-U3** · UX · Setup has no difficulty picker (all exam surfaces) · Users can't match level; API
already supports it · Personalization · High · No difficulty input in setup JSX; `validation.ts`
accepts it · 3-chip picker → `api.questions` · API exists · Small.

**P-U4** · UX · Three undocumented timer regimes (advance-only / deadline / local-lock) · Users can't
tell which rules apply · Trust · High · `PracticeTab:468-474`, `MockTab:423-436`, `RealExam:270-305`
· One-line regime label per session header · None · Trivial.

**P-U5** · UX · Zero-history Home is honest but inert (disabled CTA, null recs) · Weak activation ·
Growth · High · `TodayMission:336-344`, `RecommendedActions:89` · One-click diagnostic mission fed by
onboarding fields · Prep-intel rule addition · Medium.

**P-F1** · Frontend · Leaderboard streak fan-out (`content.ts:417`) · N extra queries/fetch · Latency ·
Medium · `Promise.all(rows.map(computeStreak))`; 30s cache never read · Read cache + slice · None · Small.

**P-F2** · Frontend/Backend · Exam-submit mastery loop in `Serializable` txn (~2 writes/Q) · Abort risk
at 200 Q under load · Reliability · Medium · `exam-submission.ts:566-585`; P2034 path exists ·
Batch upsert outside critical section · Txn rework · Medium.

**P-F3** · Frontend · 4 duplicated session machines (Quick/Mock/Custom/RealExam) · Timer/answer drift
(C2 is a symptom) · Maintainability · Medium · Parallel implementations · Extract `useExamSession` ·
Careful refactor · Medium.

**P-B1** · Backend · Dual submit validators (strict vs lenient-filter) · Silent answer drops; contract
confusion · Correctness · Medium · Two route files, same service · Unify on strict · None · Small.

**P-B2** · Backend · Legacy `submitCustomExam` (`exam.ts:513`) non-idempotent · Double-POST double-counts
*if* reachable · Integrity · Medium · Zero imports outside `exam.ts` (verify in CI) · Delete · None · Small.

**P-D1** · Mobile/a11y · Sub-44px interactive targets (`w-8/w-9` steppers incl. new dock, modal closes)
· Mis-taps, WCAG fail · Usability · High · Grep list in UX audit · Raise to 44px · None · Small.

**P-D2** · Accessibility · `useDialogA11y` on 7/13 dialogs (Practice/Custom confirms, NotificationCenter
lack trap/restore) · Keyboard/focus loss · a11y · High · Hook adoption grep · Adopt hook everywhere ·
None · Small.

**P-D3** · UI · Token bypasses (`CommandPalette`, `AppNavbar` black/white, raw `z-50/z-40`) · Light-theme
breakage · Consistency · Medium · File:line list in UX audit · Tokenize · None · Small.

**P-C1** · Content/Data · `MockTestResult(mockTestId=null)` mixes exam + mock rows · History ambiguity ·
Analytics · Low · Schema note · Add `kind` discriminator · Migration · Small.

**P-C2** · Data · UTC `studiedToday` off-by-one near midnight Dhaka · Spurious warmup rec · Correctness ·
Low · `preparation-intelligence.ts:325,545` · Dhaka-tz date key · None · Trivial.

**P-C3** · Code health · Dead code: unreachable return block (prep-intel route), `NextBestAction`
unmounted · Confusion, false signals · Maintainability · Low · Cited lines; import grep · Remove ·
None · Trivial.

**P-A1** · AI · No proactive layer; recs rule-only with no acceptance learning · AI feels static ·
Intelligence · High · AI audit · Decision-engine Phase 2–3 · Analytics events first · Large.

**P-A2** · AI · Agent blocks not one-click executable; no cancel UI · Advice without action · UX · Medium ·
`AgentBlocks`, agent SSE · Executable blocks + cancel · Frontend · Medium.

**P-N1** · Analytics · No funnel events (activation, rec acceptance, drill completion) · Can't measure
what works · Strategy · Medium · No event calls in rec handlers · 6–8 named events · None · Small.
