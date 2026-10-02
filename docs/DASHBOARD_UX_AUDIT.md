# Dashboard UX Audit — 9Th-Grade AI

Evidence-based. Severities: Critical / High / Medium / Low.

## Journey A — First login (High issues: A1, A2)

- Onboarding (`app/onboarding/page.tsx`) captures `examTarget` (free text), `examDate`, `prepLevel`,
  `studyHoursPerDay`, `goal` — all optional, no weakness/subject capture, no diagnostic.
- Home for zero-history users: `TodayMission` shows an honest placeholder with **disabled CTA**
  (`TodayMission.tsx:336-344`); `RecommendedActions` returns `null` on empty (`:89`) except a generic
  "keep practicing"; `ContinueLearning` returns `null` (`:30`). Onboarding fields are **never read** by
  `buildRecommendations` (`preparation-intelligence.ts:138-225`) — the only Home use is a
  "Target not set" label (`HomeTab.tsx:422`).
- **A1 (High):** collected onboarding data never personalizes anything. Fix: feed `examTarget/prepLevel/
  studyHoursPerDay` into `buildRecommendations` (e.g. new-user rule → "10-question diagnostic in your
  target exam") and enable the mission CTA as a one-click diagnostic deep-link.
- **A2 (High):** first screen explains but does not propel — no single obvious next action.
  Fix: new-user mission card with `[Start 10-question diagnostic]` deep-linked via `practiceIntent`.
- **A3 (Medium):** cold-start threshold (`MIN_CONFIDENT_ATTEMPTS=3`) blocks weak-topic recs until ≥3
  attempts; acceptable, but onboarding could capture 2–3 self-reported weak subjects to bridge it.

## Journey B — Daily loop (breaks: B1–B6)

Closes: Diagnose (aggregates + `/api/weak-topics`) → Recommend (9 rules, max 4) → Practice (intent
deep-links for weak-subject/topic work) → Measure (submit feeds aggregates) → Explain (per-Q
explanation + `AIExplanationButton`) → Adapt (period comparison, mastery) → Review (mistake drill
via `QuestionDrill`).

- **B1 (High):** `resume-exam` / `exam-near` / `daily-quiz` / `daily-warmup` / `keep-going` drop intent —
  `handleRecommendation` only `setActiveTab("practice")` (`HomeTab.tsx:338-344`), landing on default
  `custom` mode. Same for `TodayMission`/`ContinueLearning` quiz CTAs. `NextBestAction.tsx` drops even
  the tab context (and is unmounted dead code). Fix: carry `{mode}` intent (quiz→`quick`, resume→`mock`).
- **B2 (High):** practice result panel is a dead end — "আবার প্র্যাকটিস / নতুন নির্বাচন" only
  (`PracticeTab.tsx:851-875`), no link to mistake review or weak-topic retry. Fix: result CTAs
  `[Review N mistakes]` → mistakes tab, `[Retry weak topics]` → quick intent.
- **B3 (Medium):** revision-due count exists server-side but has no Home badge/strip; `QuickActions`
  badge prop is never rendered. Fix: "Due today: N" strip on Home.
- **B4 (Medium):** `ContinueLearning` ignores unfinished quick sessions (localStorage) and drill
  progress. Fix: surface resumable quick session.
- **B5 (Low):** `studiedToday` uses UTC date — off-by-one near midnight Asia/Dhaka. Fix: Dhaka-tz date key.
- **B6 (Low):** unreachable code after `return res` in `preparation-intelligence/route.ts:58-69`. Remove.

## Journey C — Practice (C1–C6)

Clicks to Q1: Quick ~5–7 (intent: ~2), Mock ~4–6, RealExam ~3–4. Refresh survival: Quick + Mock yes
(localStorage, wall-clock-corrected); RealExam no (in-memory only — C4 Medium).

- **C1 (High):** no difficulty selection anywhere except AI mock gen; API already accepts `difficulty`.
  Fix: 3-chip picker (সহজ/মাধ্যম/কঠিন) in setup, passed to `api.questions`.
- **C2 (High):** three undocumented timer semantics — Quick: 30s/Q advance-only; Mock: session deadline
  auto-submit; RealExam offline: local lock, nothing persisted. Users cannot tell which regime they are
  in. Fix: one-line regime label in each session header + docs.
- **C3 (Medium):** `beforeunload` only while submitting; mid-session exit warns nothing (resume covers
  Quick/Mock; Mock resume silently expires after deadline+5s). Fix: warn on dirty-session exit.
- **C5 (Medium):** Quick timer silently banks blanks; single-choice locks irreversibly on first tap
  (mis-tap unrecoverable). Fix: confirm-on-lock or single undo per question.
- **C6 (Low):** Quick `durationMin` is display-only. Either enforce or relabel as estimate.

## Journey D — Real exam (integrity: sound)

Idempotency (`userId+idempotencyKey` unique, `resumed` outcome), server deadline (+15s grace),
`questionSetHash` double-verified, negative marking correct (Bank −0.25 / BCS −0.50). Issues:
**D1 (Medium)** dual submit routes with divergent validators (strict vs lenient-filter) — unify on
strict; **D2 (Medium)** legacy non-idempotent `submitCustomExam()` still in `exam.ts` — verify unrouted,
delete; refresh survival via `submission-status` is correct.

## Journey E — AI workspace (see `AI_PRODUCT_AUDIT.md`)

AI is real (versioned prompts, hybrid retrieval, memory, quotas, circuit breakers) but **reactive**:
every surface waits for the user to ask. No proactive brief, no mistake-pattern surfacing, no
auto-generated weak-topic drills. Gaps: vocab endpoint has no quota; agent max 8 steps with no
cancellation UI reported; no streaming cancellability surfaced on tutor/solver.

## Information architecture

- Strengths: single-URL tab model with deep-linkable `?tab=&mode=&view=`; grouped nav; ⌘K palette.
- **IA1 (High):** 11 tabs overlap — Practice vs Mock vs Custom vs RealExam vs QuestionBank vs Mistakes
  blur together; users cannot predict where "take a test" lives. Fix: consolidate entry points
  (Practice hub with mode rail) and rename by job (Practice / Past papers / Mistakes / Exams).
- **IA2 (Medium):** `ecosystem` (API scope) vs `examContext` (store slug) are two parallel concepts
  with near-identical names. Fix: unify or rename (`apiScope` vs `libraryFilter`).
- **IA3 (Medium):** `NextBestAction.tsx` is dead code; `QuickActions` badge unused. Remove or wire.
- Dashboard answers "where am I / how am I doing" well; "what next + why + what improves" only
  partially (recs lack expected-impact lines).

## Component-level, motion, mobile, a11y, Bengali (summary)

- Design tokens (`app/globals.css`) are well-built (triple-scope theming, `glass-card`, `pb-safe`,
  `--bottom-nav-h`, z-scale); bypasses: `CommandPalette` + `AppNavbar` hardcode black/white entire
  palettes (break light theme), `DataStorageCard` Google-blue, `SessionSummary`/`NotificationCenter`
  raw black/white, hardcoded `z-50/z-40` in Mock/Custom. Severity: Medium (themed-surface leakage).
- Motion is gated (`useMotionTier`, reduced-motion kill-switches) but the gate is consumed almost
  only by Home; exam/AI surfaces animate ungated (Medium). No interaction-blocking sequences found.
- Mobile: sub-44px steppers/closes (`w-8/w-9`) incl. the new dock steppers and modal closes (High —
  raise interactive targets to 44px); dialogs are bottom-sheet-correct; math scrolls on ≤640px;
  `type=number` inputs lack `inputMode` (iOS zoom risk, Medium).
- A11y: universal focus ring (marketing uses theme-blind violet — Low); `useDialogA11y` on only 7 of
  ~13 dialogs — Practice/Custom unanswered-confirms and NotificationCenter lack trap/restore (High);
  palette grids need arrow-key roving (Medium); muted-text contrast ~4.0:1 dark (Low); timers
  correctly not live-announced.
- Bengali: Hind Siliguri/Noto stack + matra-safe line-height overrides are correct; KaTeX mobile
  rules good; numeral policy is mixed (Bangla prose vs Arabic chrono) with no rule (Medium — declare
  one); `line-clamp` + `leading-tight` can clip descenders (Low).

## Maturity scorecard (UX/UI strand)

- UX Maturity: developing — honest states, weak first-run propulsion, dead-ends at results.
- UI Maturity: strong tokens, leaking at marketing/command surfaces.
- Information Architecture: needs consolidation (11 overlapping tabs, dual ecosystem concepts).
- Mobile Experience: strong foundations (nav, sheets, safe-area), fails touch-target + dialog-trap gaps.
- Accessibility: WCAG 2.2 AA within reach — close dialog-trap, roving, contrast gaps.
