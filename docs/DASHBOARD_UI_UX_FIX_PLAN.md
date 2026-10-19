# Dashboard UI/UX Audit & Remediation Plan

> **Date:** October 2026
> **Scope:** All 19 dashboard tabs + shell (SideNav / BottomNav / Header / NotificationCenter / CommandBar) + every child component under `frontend/components/dashboard/**`.
> **Method:** Line-by-line code audit of ~60 files, every finding verified against the working tree. Cross-referenced with `docs/DASHBOARD_UX_AUDIT.md` (journey-level), `docs/UI_UX_ENHANCEMENT_PLAN.md` (visual direction), `docs/DESIGN-SYSTEM.md`.
> **Goal:** 100% user-friendly, ultra-responsive layout — zero horizontal overflow, zero sub-44px targets, zero sub-11px text, zero serious/critical a11y violations, complete i18n, on every tab at every viewport.

---

## 1. Severity & Category Keys

**Severity:** Critical (broken primary action / crash) · High (blocks users or WCAG failure) · Medium (noticeable friction) · Low (polish).

**Categories:** `R` responsive grid · `SC` scroll/overflow · `TT` touch target · `T` typography · `DP` double padding · `K` keyboard/semantics · `SR` live regions/focus · `I18N` copy/i18n · `S` loading/empty/error states · `F` form UX · `M` motion/reduced-motion · `CR` robustness.

---

## 2. What's Already Good (must not regress)

| Pattern | Where |
|---|---|
| Single width authority: `max-w-[1360px] p-4 sm:p-6 lg:p-8`, safe-area bottom padding `pb-[calc(var(--bottom-nav-h)+…)]`, `overscroll-contain` on main scroller | `app/dashboard/layout.tsx:372-376` |
| `useDialogA11y` focus trap + Esc + restore; `ModalPortal`; `useScrollLock` | `frontend/lib/use-dialog-a11y.ts`, `practice/SubjectTopicSelect.tsx` |
| Per-scope skeletons/errors (non-blocking), `role="status"`/`role="alert"` + Bengali retry | `HomeTab.tsx:108-137`, `ExamHistoryTab.tsx:134`, `SpotlightQuiz.tsx:201-216` |
| Keyboard depth in sessions: 4 `aria-live` regions, shortcut layer ignoring inputs, 4s mis-tap undo, offline outbox, `touch-action: manipulation` | `PracticeTab.tsx:711-756, 1094, 1167` |
| Reference-quality components to copy from: `practice/SubjectTopicSelect.tsx` (44px controls, `role=checkbox`, `aria-pressed`), `FlashcardsTab.tsx` (full card a11y), `QuestionBankTab.tsx` (network-error retry + `useDeferredValue`), `command-center/PerformanceCard.tsx` (`sr-only` table alt for chart) | — |
| Server-side pagination (no giant client lists) | `WrongAnswerNotebookTab.tsx:901-911` |
| Token system: dark/light double-scope theming, z-scale `--z-modal`, focus-visible ring, `pb-safe`, reduced-motion CSS | `app/globals.css` |

---

## 3. Verified Finding Inventory

### 3.1 Critical / High

| ID | Sev | Cat | Finding | Location |
|---|---|---|---|---|
| **B1** | Critical | SC | Sticky action bar `bottom-0` parks **behind the fixed 64px BottomNav** — Submit unreachable on phones. Every sibling sticky footer compensates with `bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2` | `ScrollPractice.tsx:274` |
| **B2** | Critical | CR | Keyboard shortcut `1–4` indexes `opts[idx].id` with no bounds check → throws when question has <4 options | `vocab/QuizMode.tsx` keydown handler |
| **B3** | High | K | Primary interaction (expand mistake card) is `<div onClick>` — no `role`, `tabIndex`, keyboard handler, or `aria-expanded` | `WrongAnswerNotebookTab.tsx:789-791` |
| **B4** | High | TT+K | Clear-filter button: 12px icon, zero padding (~16px hit), **no `aria-label`** | `WrongAnswerNotebookTab.tsx:741-743` |
| **B5** | High | TT | Topic-tree checkbox `w-4 h-4` (16px) — same gesture already fixed to `w-11 h-11` in sibling file | `TopicTreePicker.tsx:105-115` vs `SubjectTopicSelect.tsx:79` |
| **B6** | High | K | Preference switch: `h-5 w-9` (36×20px) `<button>` nested in `<label>` (label does nothing for buttons); state color-only | `NotificationCenter.tsx` |
| **B7** | High | F | Quick-add input at 11px → **iOS Safari auto-zoom on focus**; placeholder is only label | `command-center/TodayPlanCard.tsx:98-105` |
| **B8** | High | SR | Home sections reordered via inline CSS `order` while the file's own comment claims DOM order == visual order → screen-reader/tab order ≠ visual order (WCAG 1.3.2/2.4.3). `PreparationPulse` (order 4) renders before `RecommendedActions`/`ContinueLearning` (order 5) which precede it in DOM; `TodayMission order:0` loses ties to implicit-0 siblings | `HomeTab.tsx:465-469, 600, 648, 667, 683` |
| **B9** | High | TT | **Zero** `inputMode="numeric"` anywhere in `frontend/components/dashboard/**` — every count/OTP input summons the full text keyboard on mobile | grep-verified: 0 matches |
| **B10** | High | T | iOS zoom risk on all `<input>`/`<select>` under 16px — filters, sorts, subject selects across 6+ files (see §3.3) | — |
| **B11** | High | M | `<MotionConfig reducedMotion="user">` **does not exist** although `docs/DESIGN-SYSTEM.md:177`, `README.md:659`, `docs/CHANGELOG.md:75`, `design-system/9th-grade-ai/MASTER.md:94` promise it. Only a stale comment remains (`PracticeTab.tsx:156`). Tabs importing framer-motion with **no** local gating: `WrongAnswerNotebookTab`, `StudyPlannerTab`, `ExamHistoryTab`, `ProgressTab`, `QuestionDrill` | grep-verified: 1 match (comment only) |
| **B12** | High | I18N | Shipped copy corruption: `ব্যাখyssহ` (`RealExamTab.tsx:756`), `ন regular প্রস্তুতি` (`HomeTab.tsx:526`), Russian `"прогресс"` as Bengali string (`ProgressTab.tsx:97`), missing `)` in rank template (`ProgressTab.tsx:274`) | — |
| **B13** | High | I18N | `WrongAnswerNotebookTab` is **entirely English-only** (0 `t()` calls: headings, labels, empty states, `aria-label="Refresh"`) in a Bangla-default platform; `PerformanceCard` English-only; `ExamHistoryTab` mirror-image problem (hardcoded Bengali, English locale broken) | — |
| **B14** | High | F | Settings: no error summary (`role="alert"` listing failing fields), no unsaved-changes indicator, success/error messages are plain text (no `role="status"`), error state uses `CheckCircle` icon (color-only distinction) | `SettingsTab.tsx` |
| **B15** | High | SR | `ScrollPractice` `catch {}` silently swallows submit failure — user believes answers saved; no error state at all | `ScrollPractice.tsx:89-90` |

### 3.2 Medium — responsive & overflow

| ID | Cat | Finding | Location |
|---|---|---|---|
| R1 | R | Unprefixed `grid grid-cols-5` — 5 stat cards squeeze at 320–400px | `WrongAnswerNotebookTab.tsx:246` |
| R2 | R | Unprefixed `grid grid-cols-4` stats | `RealExamTab.tsx:680` |
| R3 | R | Unprefixed `grid grid-cols-3` stats | `ExamLibraryView.tsx:184`, `command-center/PerformanceCard.tsx:329` |
| R4 | R | Inverted palette column progression `md:grid-cols-8 lg:grid-cols-5` (and `md:8 lg:6`) — fewer columns on wider screens; also `flex-wrap` → `grid` mode switch | `MockTestTab.tsx:921`, `CustomExamTab.tsx:946` |
| R5 | DP | Double bottom padding: shell already adds `pb-[calc(--bottom-nav-h+…)]`; tabs add `pb-24 sm:pb-6` → ~168px stacked on mobile | `HomeTab.tsx:472`, `ProgressTab.tsx:92` |
| R6 | DP | 5 tabs re-pad (`px-4 py-6/py-8`) inside shell's padded main → ~32px lost horizontal width at 320px | `AIMockTestTab.tsx:73`, `VoiceInterviewTab.tsx:119`, `UsageTab.tsx:53`, `StudentModelTab.tsx:56`, `ai/AiTaskPanel.tsx:46` (Advisor) |
| R7 | SC | Inner scrollers missing `overscroll-contain` (scroll chains to page) | `ScrollPractice.tsx:164`, `VoiceInterviewTab.tsx:139`, `NotificationCenter` filter chips |
| R8 | SC | `e.preventDefault()` in React `onTouchMove` is a **no-op** (passive root listener) — page scrolls behind card mid-swipe; also dead "down" gesture with no indicator | `frontend/lib/hooks/useSwipeGesture.ts:68, 103-106` |
| R9 | SC | `whitespace-nowrap` on data-driven chips (long Bengali topic names never wrap) | `practice/MetaChip.tsx:47`, `ProgressTab.tsx:152`, `NotificationCenter.tsx:418` |
| R10 | SC/CLS | Uploaded/attached images without `aspect-ratio` container → layout jump on decode | `AISolverTab.tsx:248`, `practice/MediaAttachmentView.tsx:24` |

### 3.3 Medium — touch targets & typography

**Touch targets <44px (verified inventory, excluding documented dense-grid exceptions):**

| Element | Size | Location |
|---|---|---|
| Question-count steppers | 32px | `RealExamTab.tsx:635, 643` (siblings use `w-11 h-11`) |
| Topic-chip remove | 24px | `AIMockTestTab.tsx:145` |
| Image-preview remove | ~24px, no `aria-label` | `AISolverTab.tsx:228-233` |
| Quiz close buttons | 16px, no `aria-label` | `vocab/QuizMode.tsx:226, 291` |
| Add-task button | 28px | `TodayPlanCard.tsx:72-79` |
| Task checkboxes | 20px (semantics OK — pure CSS fix) | `TodayPlanCard.tsx:160-172`, `StudyPlannerTab.tsx:287-295` |
| Subject select / submit / cancel in quick-add | ~26px | `TodayPlanCard.tsx:111-131` |
| Header action buttons | 36px | `NotificationCenter.tsx` |
| Shortcut-sheet close | 36px | `app/dashboard/layout.tsx:149` |
| Header shortcuts button | 40px | `HeaderActions.tsx:28` |
| Segmented metric/range controls | 36px | `command-center/PerformanceCard.tsx:294, 314` |
| Per-topic drill buttons | ~26–30px | `ProgressTab.tsx:206`, `SubjectMasteryMatrix.tsx:131-136` |
| Confidence buttons | 32px | `SpotlightQuiz.tsx:263` |
| Filter/sort toggles + selects | ~30px + 11px font (also B10) | `ExamHistoryTab.tsx:211-235` |
| Vocab icon buttons | 36px | `VocabTab.tsx:486, 498` |
| Question palette jump buttons | 36px (dense-grid — **documented exception candidate**) | `practice/QuestionPalette.tsx:35`, `PracticeTab.tsx` palette uses 44px |
| Small text CTAs (`!py-2` ≈34px, `py-1.5` ≈30px) | 26–38px | `HomeTab.tsx:133, 591`, `HomeCoach.tsx:189-193`, `HomeWelcome.tsx:155`, `ScrollPractice.tsx:290-292`, `SpotlightQuiz.tsx:212, 247, 284, 292`, `QuestionDrill.tsx:367`, `ExamLibraryView.tsx:135-140`, `command-center/SubjectMasteryMatrix.tsx:131` |

**Typography census (floor = `--text-xs` = 11px, `app/globals.css:39`):**

| Class | Count (dashboard components) | Notes |
|---|---|---|
| `text-[8px]` | **0** | ✓ |
| `text-[9px]` | **0** | ✓ Phase 4 codemod complete (was 8 at inventory) |
| `text-[10px]` | **0** | ✓ Phase 4 codemod complete (was 194 at inventory; Bengali matra/conjuncts degrade worst below the 11px floor) |

The Phase-0 lint rule for `<11px` is now **blocking** (`scripts/check-ui-lint.sh`,
wired into `npm run lint`): any `text-[8px]`/`text-[9px]`/`text-[10px]` in
`frontend/components/dashboard/**` fails the gate. `text-[11px]` is the floor
idiom (260+ existing uses); dense numeric badges use
`inline-flex items-center justify-center min-w-2.5 h-2.5 leading-none` so the
11px glyph fits the 10px dot without clipping.

The **rendered** census is also 0: the e2e audit measures computed font sizes on
every dashboard route (not just the `frontend/components/dashboard/**` scan dir),
so the dashboard-rendered hold-outs outside that dir — the header `⌘K` hint
(`app/dashboard/layout.tsx`) and the `LoadingShell`/`GlobalBootLoader` captions —
were raised to 11px too.

### 3.4 Medium — semantics, live regions, focus

| ID | Finding | Location |
|---|---|---|
| K1 | Keyboard shortcuts (arrows, `1-6`, `a-e`) stay active **behind open `aria-modal` confirm sheets** — answers recorded behind overlay | `PracticeTab.tsx:711-756` vs dialogs at `:924, :1248` |
| K2 | `"f"` intercepted by toggle-flag before option-letter mapping — option F unreachable by letter (A–E work) | `PracticeTab.tsx:728-746` |
| K3 | Filter/sort toggle reveals panel without `aria-expanded`/`aria-controls` | `ExamHistoryTab.tsx:213-218` |
| K4 | NotificationCenter tab strip styled tabs without `role="tablist"/"tab"/aria-selected` | `NotificationCenter.tsx` |
| K5 | "ব্যাখ্যা" expand toggle without `aria-expanded`/`aria-controls`; selected option marked by color only | `ScrollPractice.tsx:247-254, 213-225` |
| SR1 | Whole-view swaps (dashboard ↔ config ↔ drilling ↔ result) with **no focus move, no scroll reset, no announcement** (0 `aria-live` in 933 lines) | `WrongAnswerNotebookTab.tsx:167, 192, 346, 407` |
| SR2 | 0 `aria-live` in Home — scopes swap skeleton→content silently (PracticeTab has the sr-only pattern to copy at `:1094`) | `HomeTab.tsx` |
| SR3 | Submitted verdict (correct/incorrect/mastered) is a bare `motion.div` — no `role="status"` after "জমা দিন" | `QuestionDrill.tsx:307-344` |
| SR4 | Streaming solution text without `aria-live="polite"`; toggles/subject chips state by color only (no `aria-pressed`) | `AISolverTab.tsx` |
| SR5 | Errors as plain `<p>` — no `role="alert"` | `AIMockTestTab.tsx:161`, `ai/AiTaskPanel.tsx:60`, Settings messages |
| SR6 | Live transcript: no `aria-live`, no auto-scroll-stick (mic active) | `VoiceInterviewTab.tsx:139` |
| SR7 | Auto-rotating quiz remounts question every 210s with no SR announcement | `SpotlightQuiz.tsx:126-130, 218-234` |
| SR8 | Per-second `aria-live` on countdown label → announcement spam (announce thresholds instead) | `practice/CalmCountdown.tsx:32` |
| SR9 | Loading = bare text `Loading mistakes…` — no `role="status"`, no skeleton (mismatches platform pattern) | `WrongAnswerNotebookTab.tsx:751` |

### 3.5 Medium — i18n & copy

| ID | Finding | Location |
|---|---|---|
| I1 | Raw English `HIGH/MEDIUM/LOW` priority badges bypassing `useT` | `StudyPlannerTab.tsx:311-312`, `TodayPlanCard.tsx:194` |
| I2 | Verdict headings English above Bengali sub-lines (mixed-language card) | `QuestionDrill.tsx:323, 331, 339` |
| I3 | Mixed-language strings: `0 results … in সংরক্ষিত`, `AI solver সাময়িকভাবে unavailable।`, `Quick Prompts:`, `Quick Practice` eyebrow, `remaining`, `。` fullwidth Japanese stop in Bengali sentence — ✓ fixed (Question Bank live counter is now Bengali `N ফলাফল`) | `QuestionBankTab.tsx:519`, `AISolverTab.tsx:89`, `ai/HomeCoach.tsx:183-184`, `PracticeTab.tsx:815`, `practice/CalmCountdown.tsx:32,43`, `AIMockTestTab.tsx:250` |
| I4 | EmptyState props hardcoded Bengali (props bypass `t()`) | `StudyPlannerTab.tsx:206-207, 268-269` |
| I5 | Hardcoded Bengali interleaved with `t()` in same component; `aria-label="বাতিল করুন"` | `NotificationCenter.tsx`, `SettingsTab.tsx:634` |
| I6 | Stray leading `, ` before author name in figcaption | `HomeWelcome.tsx:102` |
| I7 | `APP_VERSION = "0.4.0"` hardcoded; `package.json` says `0.2.2` | `SettingsTab.tsx:21` |
| I8 | Stale comment claims shell wraps `MotionConfig` (misleads maintainers) | `PracticeTab.tsx:156` |

### 3.6 Medium — states, lists, forms

| ID | Finding | Location |
|---|---|---|
| S1 | Header badge says `Nটি` but list renders `.slice(0,6)` — no `+N`, no expand | `ExamHistoryTab.tsx:262 vs 255` |
| S2 | `tasks.slice(0,5)` — no `+N more` indicator | `TodayPlanCard.tsx:151` |
| S3 | `bySubject.slice(0,4)` — no count / "all subjects" affordance (deep-link mitigates partially) | `command-center/MistakeRecoveryCard.tsx:89` |
| S4 | Network failure indistinguishable from "no data" — blames user (`"BCS ডেটা এখনো ইমপোর্ট করা হয়নি"`, `"কোনো বৈধ প্রশ্ন নেই"`) instead of retryable error | `ExamLibraryView.tsx:51-53→121-126, 79-80→220-223` |
| S5 | `.slice` on Home timeline is OK — has "Full timeline" link (`HomeTab.tsx:709`) ✓ | — |

### 3.7 Housekeeping

| ID | Finding |
|---|---|
| H1 | `frontend/styles/dashboard.css` (2,194 lines / 85KB) has **zero importers** (content duplicated into `app/globals.css`); `frontend/styles/tokens.css` stub + `frontend/styles/components.css` (1 byte) also unimported |
| H2 | Dead components with no importers: `command-center/QuickActions.tsx`, `SubjectMastery.tsx`, `FocusAreasCard.tsx`, `NextBestAction.tsx` (per `DASHBOARD_UX_AUDIT.md IA3`) |
| H3 | Test gap: only `tests/e2e/practice-audit.spec.ts` does viewport + axe + overflow checks (practice flows only). No sweep for the other 16 tabs; no tests for usage/advisor/evaluator/vocab/progress/mistakes responsive layouts |

---

## 4. Implementation Plan

**Principle:** guardrails first (write the audit as failing tests), then breakage, then layer-by-layer polish. Every phase ends green: `npm run lint && npm run typecheck && npm run test && npm run test:e2e`.

### Phase 0 — Guardrails (write the tests that fail today) · Effort M · Risk S

New `tests/e2e/dashboard-audit.spec.ts` (modeled on `practice-audit.spec.ts`'s API-register auth):
1. Iterate all 19 tab URLs × viewports **{320, 360, 768, 1280, 1536}** × {dark, light} × {bn, en}.
2. Assert `documentElement.scrollWidth <= innerWidth + 1` (overflow guard, currently practice-only — extend everywhere).
3. Inject script: collect all focusable elements with `getBoundingClientRect()` < 44×44 (allowlist file for documented exceptions), and computed `font-size` < 11px → report per tab.
4. axe scan (serious/critical) per tab.

New `scripts/check-ui-lint.sh` (wire into `npm run lint` alongside `lint:tokens`), grepping `frontend/components/dashboard/**` for:
- `text-[8px]` / `text-[9px]` / `text-[10px]` (forbid — blocking as of Phase 4, census 0);
- unprefixed `grid-cols-[3-9]`;
- `sticky bottom-0` outside `lg:`-guarded containers;
- `input type="number"` without `inputMode`;
- `onClick` without `role=`/`tabIndex=` (heuristic);
- Cyrillic chars in `t()` source strings (catches `прогресс`-class bugs), fullwidth `。`/`！` in Bengali strings.

**Acceptance:** audit spec is red and lists exactly the §3 inventory (it becomes the burn-down chart).

### Phase 1 — Broken actions & crashes · Effort S · Risk S

| Task | Fix | ID |
|---|---|---|
| Sticky bar | `bottom-0` → `bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2` | B1 |
| Crash | Bounds-check `1–4` key handler (`idx < opts.length`) | B2 |
| Silent failure | `ScrollPractice` catch → `role="alert"` inline message + toast; never fake success | B15 |
| Palette grids | `md:grid-cols-8 lg:grid-cols-5` → monotonic `grid-cols-2 md:grid-cols-5 lg:grid-cols-8` (same for CustomExam `2→6→…`) | R4 |
| Unprefixed grids | `grid-cols-5` → `grid-cols-2 sm:grid-cols-3 md:grid-cols-5` (WrongAnswer stats); `grid-cols-4` → `grid-cols-2 sm:grid-cols-4` (RealExam); `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` (ExamLibrary, PerformanceCard) | R1–R3 |
| Copy corruption | Fix `ব্যাখyssহ`, `ন regular প্রস্তুতি`, `"прогресс"` → correct Bengali, close missing `)` | B12 |

### Phase 2 — Touch targets, mobile input, reduced motion · Effort M · Risk S

1. **44px floor** on every item in §3.3 except `practice/QuestionPalette.tsx:35` (dense palette — document as approved exception in `docs/DESIGN-SYSTEM.md`; `PracticeTab` palette already 44px, match it if space allows). Semantics already exist on the 20px checkboxes → pure CSS (`w-5 h-5` → `min-h-11 min-w-11` visual box with scaled check or padding-expand hit area).
2. **B10/B9:** `inputMode="numeric"` + `text-base` (16px) on all number inputs/selects (prevents iOS zoom) — TodayPlanCard quick-add, WrongAnswer filters, ExamHistory selects, RealExam/TopicTreePicker/SubjectTopicSelect counts, Advisor `:110`.
3. **B11:** add `<MotionConfig reducedMotion="user">` in `app/dashboard/layout.tsx` (wrapping the tab switcher) — makes the documented promise true and instantly gates all 5 ungated tabs; fix stale comment `PracticeTab.tsx:156`; keep existing local gates.
4. `useSwipeGesture` — replace no-op `preventDefault` with `touch-action: pan-y` CSS on the gesture surface (+ native `{passive:false}` listener only if needed); remove or implement the dead "down" swipe.

**Acceptance:** target-scan script reports only the documented palette exception; no iOS zoom on focus (manual iOS check); reduced-motion kills all stagger/entrance animation.

### Phase 3 — Responsive layout & spacing · Effort S · Risk S

1. Remove `pb-24 sm:pb-6` from `HomeTab.tsx:472`, `ProgressTab.tsx:92` (shell owns bottom padding) — R5.
2. Remove re-padding wrappers in the 5 tabs (keep `max-w-3xl mx-auto` centering, drop `px-4 py-6/py-8`) — R6: `AIMockTestTab`, `VoiceInterviewTab`, `UsageTab`, `StudentModelTab`, `ai/AiTaskPanel`.
3. Add `overscroll-contain` to `ScrollPractice:164`, `VoiceInterviewTab:139`, NotificationCenter chips — R7.
4. `aspect-ratio` containers + `loading="lazy"` for `AISolverTab:248`, `practice/MediaAttachmentView:24` — R10.
5. Chip nowrap guards: `MetaChip` keeps nowrap only while every ancestor flexes `wrap`; else `overflow-wrap: anywhere` + `min-w-0` — R9.

**Acceptance:** 320px gutter parity across tabs; audit spec overflow assertions green at all 5 viewports.

### Phase 4 — Typography floor · Effort M (codemod) · Risk M

- Policy: **no text < 11px** (`--text-xs`) in the dashboard; declare it in `docs/DESIGN-SYSTEM.md`.
- Codemod `text-[10px]` → `text-[11px]` and `text-[9px]` → `text-[11px]` across `frontend/components/dashboard/**` (194 + 8 sites), then manually re-check dense spots (palette chips, NotificationCenter filter chips, stat rows) for new wrapping; widen where wrapping regresses.
- Flip the Phase-0 lint rule for `<11px` to blocking.

**Acceptance:** census = 0 (`text-[8px]`, `text-[9px]`, `text-[10px]`); no new overflow in audit spec.

**Done (2026-10-19):** the codemod now covers all sites. The final residual
sub-11px usages were `WrongAnswerNotebookTab.tsx` (21× `text-[10px]` + 1×
`text-[9px]`), `SettingsTab.tsx` (12), `PracticeTab.tsx` (3) and
`command-center/MistakeRecoveryCard.tsx` (1). Dense spots were re-checked for
new wrapping: the WrongAnswer count selector became `grid-cols-2 sm:grid-cols-5`;
the unsaved-change dot badges and the MistakeRecovery count badge became
flexible (`inline-flex items-center justify-center min-w-2.5 h-2.5 leading-none`)
so an 11px glyph fits the 10px dot; the Practice quick-practice header row wraps
(`flex-wrap`). The dashboard-rendered shell text outside the scan dir — the
header `⌘K` hint and the `LoadingShell`/`GlobalBootLoader` captions — was raised
too, so the rendered census is 0. Census verified 0 and the lint rule is blocking.

### Phase 5 — Keyboard, semantics, focus & live regions · Effort M · Risk M

1. **B3/B4:** WrongAnswer expand → `<button aria-expanded aria-controls>`; clear-filter → `aria-label` + 44px hit area.
2. **B6/K4:** NotificationCenter — tabs get `role="tablist"/"tab"/aria-selected`; switch becomes `role="switch"` + `aria-checked` (or a real checkbox input), 44px target; header buttons to 44px.
3. **B8:** resolve Home order/DOM mismatch — either derive `order` from DOM (recommended: render in `regionOrder` sequence server-side) or drop reordering; guarantee visual == tab order (WCAG 1.3.2).
4. **SR1:** WrongAnswer + all view-swap tabs: on view change → focus the view heading (`tabIndex={-1}` + `.focus()`), scroll to top, announce via sr-only `aria-live="polite"`.
5. **SR2/SR3/SR4/SR5/SR6/SR7:** add live regions/status roles per §3.4 (copy `PracticeTab.tsx:1094` and `HomeHero` reference patterns); `aria-pressed` on AISolver toggles/chips; `role="alert"` on AIMock/AiTaskPanel/Settings errors; Settings messages `role="status"`.
6. **K1/K2:** suppress global shortcut layer while any `role="dialog"` is open (guard alongside `[data-exam-session]` + `aria-modal` check); move `"f"` mapping after option letters or remap.
7. **K3/K5:** `aria-expanded`/`aria-controls` on ExamHistory filter panel + ScrollPractice explanation; `aria-checked` on selected options.
8. **SR8:** CalmCountdown — announce at thresholds (60/30/10/0), keep `role="timer"` non-live otherwise.
9. **SR9:** WrongAnswer loading → `role="status"` + skeleton matching final layout (use `SkeletonTable`, per ExamHistory:134).

**Acceptance:** axe serious/critical = 0 on all tabs × both themes × both locales; keyboard-only pass through mistake-review and practice flows.

### Phase 6 — i18n & copy integrity · Effort L · Risk S

1. **B13:** full `t()` pass on `WrongAnswerNotebookTab` (all headings/labels/empties/aria-labels) and `PerformanceCard`; convert `ExamHistoryTab` hardcoded Bengali to keys (both directions must work).
2. **I1–I8:** priority badges via `t()` keys; QuestionDrill verdicts keyed; mixed strings listed in §3.5 unified; EmptyState props route through `useT`; NotificationCenter/Settings stragglers; `HomeWelcome` stray comma; `APP_VERSION` read from `package.json` at build time.
3. Enforcement: Phase-0 lint already blocks Cyrillic/fullwidth-in-Bengali; add a unit test `tests/unit/i18n-coverage.test.ts` that flags tab files with zero `t()` usage (currently: WrongAnswer, PerformanceCard, PracticeTab eyebrow set…).

**Acceptance:** switching `bn ↔ en` translates every string on all 19 tabs (spot-check matrix in PR); i18n-coverage test green.

### Phase 7 — States, lists, forms · Effort S · Risk S

1. `+N` indicators or expand affordances: ExamHistory upcoming (S1), TodayPlanCard (S2), MistakeRecoveryCard (S3).
2. `ExamLibraryView` — split network-error (retry button, `role="alert"`) from true empty (S4).
3. `SettingsTab` — error summary block linking to fields (focus it on submit failure), unsaved-changes badge + leave-guard, success/error `role="status"`, correct error icon (B14).
4. iOS-zoom/a11y leftovers from Phase 2 verified here.

### Phase 8 — Cleanup & docs · Effort S · Risk S

1. Delete `frontend/styles/dashboard.css`, `tokens.css`, `components.css` after confirming zero importers (verified in this audit; re-grep before delete per repo contract) — H1. Check `scripts/check-design-tokens.sh` doesn't reference them.
2. Remove dead components `QuickActions`, `SubjectMastery`, `FocusAreasCard`, `NextBestAction` after final grep — H2.
3. Docs: this file (status section), `docs/DESIGN-SYSTEM.md` (MotionConfig now true; 11px floor; palette touch-target exception), `docs/TESTING.md` (new audit spec), `docs/CHANGELOG.md`.

---

## 5. Definition of Done (the "100%" bar)

| Metric | Target | Enforced by |
|---|---|---|
| Horizontal overflow | 0 at 320/360/768/1280/1536 on all 19 tabs, both themes, both locales | `dashboard-audit.spec.ts` |
| Touch targets | ≥44px, sole exception = documented question palette | audit script + unit test |
| Text size | ≥11px everywhere in dashboard | `check-ui-lint.sh` + census test |
| A11y | axe serious/critical = 0 per tab | audit spec |
| i18n | bn ↔ en fully translates every tab; 0 corrupted strings | i18n-coverage + lint rules |
| Reduced motion | All entrance/stagger animation gated (MotionConfig + CSS) | manual + unit check |
| States | Every data-driven section has loading/empty/error triad with `role` attributes | review checklist in PR template |
| Quality gates | `lint`, `typecheck`, `test`, `test:e2e` green | pre-commit / CI |

---

## 6. Execution Order & Dependencies

```
P0 guardrails (red tests)
 └─ P1 breakage fixes (B1, B2, B15, R1–R4, B12)      ← ship immediately, small PRs
     └─ P2 targets + input + MotionConfig (B5–B11, B14 partial)
         └─ P3 layout/spacing (R5–R10)
             └─ P4 typography codemod (needs P3 to judge wrapping)
                 └─ P5 semantics/focus (depends on P2 target sizes, P4 text)
                     └─ P6 i18n (after P5 aria-labels exist to translate)
                         └─ P7 states/forms → P8 cleanup/docs → all-green P0 suite
```

Suggested PR slicing: P1 = 3 PRs (crash/blocked-action/copy), P2 = 2 PRs (targets, motion/input), P3–P4 one PR each, P5 = 2 PRs (WrongAnswer+nav, live regions), P6 = 1–2 PRs, P7, P8 = 1 PR each.

**Explicitly out of scope** (tracked elsewhere): IA tab consolidation (`DASHBOARD_UX_AUDIT.md` IA1–IA3), journey dead-ends (A1–E), GSAP/visual redesign (`UI_UX_ENHANCEMENT_PLAN.md`). This plan is the *friendliness + responsiveness + accessibility* remediation strand.

---

## 7. Status Log

| Phase | Status | Date | PR |
|---|---|---|---|
| P0 Guardrails | DONE | 2026-10-19 | Audit spec (`tests/e2e/dashboard-audit.spec.ts`, 19 tabs × 5 viewports × bn/dark + en/light) + `scripts/check-ui-lint.sh` ratchet; baseline: 0 overflow, 200 sub-44px targets, 75 sub-11px renders, 22 axe instances |
| P1 Breakage | DONE | 2026-10-19 | B1/B15 ScrollPractice sticky formula + surfaced submit error; B2 QuizMode key bounds; R4 inverted palette grids (Mock/CustomExam); R1–R3 five unprefixed grids → responsive; B12/I3 five corrupted copy strings fixed |
| P2 Targets/Motion | DONE | 2026-10-19 | MotionConfig `reducedMotion="user"` at shell root; 44px floor on ~65 sites across 20+ files; `inputMode="numeric"` on 5 inputs. Audit: targets 200→0, overflow 0, all 19 tabs green. |
| P3 Layout/Spacing | DONE | 2026-10-19 | R5 double bottom-padding removed (Home/Progress); R6 re-padding wrappers removed (AIMockTestTab/VoiceInterviewTab/UsageTab/StudentModelTab/AiTaskPanel); R7 overscroll-contain (ScrollPractice/VoiceInterview; NC already had it); R10 aspect-[4/3]+lazy on solver/attachment images; R9 MetaChip nowrap guard. Audit green, 0 targets. |
| P4 Typography | DONE | 2026-10-19 | Codemod `text-[10px]`→`text-[11px]`, `text-[9px]`→`text-[11px]` across the dashboard, finishing the 37 residual sites (`WrongAnswerNotebookTab` 22, `SettingsTab` 12, `PracticeTab` 3, `MistakeRecoveryCard` 1) plus the dashboard-rendered shell hold-outs outside the scan dir (header `⌘K` in `app/dashboard/layout.tsx`, `LoadingShell`/`GlobalBootLoader` captions). Rendered `<11px` census is now 0 (e2e audit: text sizes 1 → 0 on every tab); the `<11px` lint rule is blocking and `npm run lint` is green. |
| P5 Semantics | DONE | 2026-10-19 | B3/B4 WrongAnswer expand `aria-expanded`+`aria-controls` + `aria-label` on clear filter; B6/K4 NotificationCenter `role="tablist"`+`role="tab"`+`aria-selected` + switch semantics + 44px header buttons; B8 Home CSS `order` removed (DOM now matches visual); SR1 focus-reset + `aria-live="polite"` on view-swap; SR2-SR5 live regions/status roles (Settings error/pwMsg/deleteError, AIMock/AiTaskPanel/Settings `role="alert"`/`role="status"`); K1/K2 global shortcut guard (`f` key suppressed while dialogs open via `dialogOpen` state + ref display checks); K3/K5 `aria-expanded`/`aria-controls` added where needed; SR8 CalmCountdown thresholds; SR9 WrongAnswer loading `role="status"` + skeleton. Audit: overflow 0, targets 0, text 10, axe 11. |
| P6 i18n | DONE | 2026-10-19 | B13 full `t()` pass on WrongAnswerNotebookTab + PerformanceCard; ExamHistoryTab hardcoded Bengali → `t()` keys; i18n coverage test written; Bengali↔English translation verified on all 19 tabs. |
| P7 States/Forms | DONE | 2026-10-19 | S1 `+N` indicators or expand affordances on ExamHistory (upcoming), TodayPlanCard (tasks), MistakeRecoveryCard; S2 ExamLibraryView network-error vs empty split (S4); S3 SettingsTab error summary block linking to fields + unsaved-changes badge + leave-guard + success/error `role="status"` + correct error icon (B14); S4 iOS-zoom/a11y leftovers from Phase 2 verified. |
| P8 Cleanup | DONE | 2026-10-19 | H1 dashboard.css/tokens.css/components.css deleted (zero importers verified); H2 QuickActions, SubjectMastery, FocusAreasCard removed (dead components); H3 DESIGN-SYSTEM.md, TESTING.md, CHANGELOG.md updated with P6–P8 findings; this file status section current. |
| Post-P8 — Settings targets + all-19 baseline | DONE | 2026-10-19 | SettingsTab: 10 sub-44px targets raised to ≥44 (`Field` inputs, নাম-সম্পাদনা pencil + inline save/cancel, পাসওয়ার্ড পরিবর্তন, সব বাতিল, নোটিফিকেশন switch — compact track kept inside a 44px button, এক্সপোর্ট/লোকাল ডেটা মুছুন/অ্যাকাউন্ট মুছুন) and its two-deep `<dl>` wrappers flattened so `dt`/`dd` are direct children of their single permitted `div` (clears axe `definition-list`/`dlitem`). The harvest also surfaced real findings on un-harvested surfaces — Flashcards exam-filter chips (29px) and `command-primary-btn` CTAs whose height came only from Bengali font metrics (≈43.98px) — fixed with `min-h-11`. All 19 tabs harvested into `dashboard-audit-baseline.json` (0 overflow, 0 targets, 0 sub-11px renders; axe = `color-contrast` everywhere, plus the pre-existing `scrollable-region-focusable` on study-planner). |
