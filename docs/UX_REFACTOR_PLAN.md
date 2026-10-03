# UX Refactor Plan — Futuristic SaaS AI Dashboard

> Status 2026-10-03: **Phase 1 + Phase 2 + Phase 3 shipped.**
> Phase 1/2 verified earlier. Phase 3 verified: `typecheck` clean, `lint` 0 new
> issues, `lint:tokens` clean, full suite at pre-existing baseline only
> (4 `qb-import-bank` failures, confirmed on clean tree), `next build` 123/123,
> computed-style + screenshot check in real Chromium (no JS/CSS errors).

Derived from deep internet research (2026 SaaS/AI-dashboard consensus) + full
repo audit. Guiding law: **prioritization signals maturity; restraint signals premium.**
North star: one calm, intelligent, bilingual command surface — not a widget wall.

## Phase 1 — Correctness + dead code + token hygiene (execute now)

### 1A. i18n bugs (all verified in code)
| # | Fix | File |
|---|-----|------|
| 1 | `WEEKDAY_SHORT_BN` starts শনি at index 0 but `getDay()` 0=Sunday → reorder to start রবি | `HomeTab.tsx:55` |
| 2 | `formatDate` hardcodes `bn-BD` → accept `lang`, use `bn-BD`/`en-GB` | `HomeTabHelpers.tsx:84`, caller `ExamCountdownCard.tsx:46` |
| 3 | Hardcoded English in `TodayPlanCard` (`Today's Adaptive Plan`, `Add Task…`, `Cancel`, `Save`, `Open AI Planner`, lines 64/97/100/145/204) → `t(lang,…)` | `command-center/TodayPlanCard.tsx` |
| 4 | `StreakHeatmap` Bengali-only `aria-label` → localized; add `title` + today-ring marker | `StreakHeatmap.tsx:24,51` |
| 5 | Mock result date hardcodes `en-GB` → lang-aware | `HomeTab.tsx:693` |

### 1B. Dead-code deletion
| # | Fix |
|---|-----|
| 1 | Delete orphan `DailyQuizWidget.tsx` (~400 LOC, unmounted anywhere; only test refs) + remove from `tests/NewFeatures.test.tsx` |
| 2 | Delete HomeTab shortcuts portal + `?` listener (`HomeTab.tsx:373-400,735-774`); layout `ShortcutsSheet` is the single global one. Bump layout sheet close btn to 44px |
| 3 | Delete unused `CountdownClock/CountdownRing/CountdownRingLive` (`HomeTabHelpers.tsx:29-64`); keep `useCountdown`, `useExamDaysLeft`, `formatDate` (used by `ExamCountdownCard`) |

### 1C. Token hygiene (mechanical, zero visual change except correctness)
| # | Fix |
|---|-----|
| 1 | `DataStorageCard.tsx:174,179` hardcoded Google-blue/emerald → `var(--primary)` / semantic tokens |
| 2 | `NotificationCenter.tsx:363` `bg-white` knob → theme token |
| 3 | `VocabTab.tsx:243` `to-emerald-500` → token |
| 4 | Degenerate `from-[var(--X)] to-[var(--X)]` gradients → solid `bg-[var(--X)]` (7 sites: FlashcardsTab:321, MockTestTab:640/887, StudyPlannerTab:144, QuestionDrill:253, CustomExamTab:1162) |

Accepted exception: `NotificationCenter` toggle knob keeps `bg-white` — a deliberate
cross-theme constant (white knob reads correctly on accent tracks in both themes;
the inverse token would go near-black in dark mode).

## Phase 2 — AI-first home + AI surface upgrades (execute now)

### 2A. AI-summary-first hero (flagship)
Reorder Home §§1–2: `HomeHero` streams the `home_brief` summary **first** (auto-run on signals change, existing AbortController), with `TodayMission` CTA rendered *inside* the brief as the single action. Mission orbit SVG → decorative `aria-hidden`. `PreparationPulse` becomes a compact 4-stat strip directly under the hero. Charts stay below for verification. Touches: `HomeTab.tsx:510-559`, `TodayMission.tsx`, `HomeHero.tsx`.

### 2B. Unified empty-state checklist (new users)
New `HomeEmptyChecklist` (diagnostic → warm-up → planner) replaces three bespoke empties; `RecommendedActions`/`ContinueLearning` return it instead of `null`. Driven by existing `hasData`.

### 2C. Layout-shift stability
`min-h` skeletons for `RecommendedActions`/`ContinueLearning` instead of null-collapse.

### 2D. AISourceFooter (provenance everywhere)
Extract `ThreadView:96-106` meta line → `<AISourceFooter provider model latencyMs toolCount isMock />`; render in Solver, Evaluator, Advisor, MockTest, Explain button, Mnemonic button. Always Bengali mock warning.

### 2E. Actionable AI outputs
Solver `relatedConcept` → Drill/Save/Ask-Tutor chips; Evaluator result → Practice-gaps/Copy/Reteach row; Advisor weekly tasks → clickable + Push-to-Planner; Mock explanation → reuse `AIExplanationButton` + Retry-similar; feedback thumbs on all outputs (reuse workspace pattern).

### 2F. Mock-tab state repair
Wire `submitted` properly, add Undo-reveal + Regenerate(same spec) + Save-wrong-to-mistakes.

### 2G. CommandBar answers inline
`Ask AI…` row: ⇧Enter calls `askAssistant`, previews reply in palette with `Open in Tutor` (preserves query via `launchAI`).

## Phase 3 — Needs visual review / heavier lifts (NOT now)
- `ai-workspace.css:562-742` green fork vs indigo system (screenshot both themes first)
- `shadow-neon-glow` ×30 + gradient primaries → token shadows/solid (visual change)
- Card-system unification, `text-eyebrow`/`text-caption` utilities, lint guard
- Voice-stack dedupe (`VoiceInterviewTab` → `AIWorkspace` preset)
- Bespoke exam-readiness viz, brand-driven motion signature

## Verification per phase
`npm run typecheck && npm run lint && npm run test` (+ targeted vitest files). No visual-regression infra exists — Phase 2/3 changes get manual screenshot review at 360px + 1280px, dark + light.
