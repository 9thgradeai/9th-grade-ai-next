# User Dashboard — Component & UX Inventory

Canonical reference for the authenticated dashboard (`/dashboard`): shell,
navigation, all 10 tabs, reusable cards, state, and design tokens. Labels are
quoted literally from source (Bengali/English bilingual via `t(lang, …)`).

Related docs: `DESIGN-SYSTEM.md` (tokens/primitives), `API.md` (endpoints),
`ARCHITECTURE.md` (data flow), `AI-SYSTEM.md` (AI surfaces).

## Architecture

- **Route**: `app/dashboard/page.tsx` — code-split tab router. Only the active
  tab's chunk loads (`TabChunkLoading` skeleton + `LoadingShell`), animated
  transitions, `?tab=` URL sync.
- **Shell**: `app/dashboard/layout.tsx` — `EmailVerificationGate`, theme
  provider, skip-link, desktop `SideNav` (≥1024px), mobile drawer dialog,
  fixed header, scrollable `main#dashboard-content` (`max-w-1360px`),
  `BottomNav`, plus globally mounted `VoiceAITutor`, `PracticeDrillOverlay`,
  `CommandBar`.
- **Tabs** (`frontend/lib/data/index.ts`): `home`, `practice`, `question-bank`,
  `mistakes`, `progress`, `flashcards`, `study-planner`, `exam-history`,
  `real-exam`, `settings`.
- **Icons**: single Phosphor system (`frontend/lib/exam-ui.ts` → `TAB_ICONS`).
  Difficulty: সহজ / মাঝারি / কঠিন.
- **Store** (`frontend/lib/store-ctx/dashboard.tsx`, persisted
  `9th_grade_ai_store_v2`): `activeTab`, `questionBankFilters`,
  `examContext` (null = all exams; switching clears cross-tab intents),
  `practiceIntent {subject, mode}`, `mistakeIntent {subject, status}`.
  Metrics are never stored — always server-fetched per tab.
- **Keyboard**: `1–9/0` jump tabs (suppressed in inputs/dialogs); `⌘K/Ctrl+K`
  toggles the command palette; Home adds `P/M/W/A/F/Q/L/R`.

## Navigation

### SideNav — `frontend/components/dashboard/SideNav.tsx`

Collapsible 272px ↔ 76px icon rail (persisted). Brand (`9Th-Grade AI` /
`বিসিএস • ব্যাংক • চাকরি`) → `ExamSwitcher` → grouped nav —
**Primary**: Home, Practice, Question Bank, Mistakes, Progress;
**Study**: Planner, Flashcards, Exam History, Real Exam;
**Account**: Settings (each English + Bengali, `aria-current="page"`, active
indicator) → collapse toggle → user card (avatar, name, @handle, presence
dot) + Log out.

### BottomNav — `frontend/components/dashboard/BottomNav.tsx`

Mobile bar: হোম, প্র্যাকটিস, ব্যাংক, ভুল, প্রোগ্রেস + আরও sheet
(`সকল সুবিধা` grid, `বন্ধ করুন`, logout).

### CommandBar — `frontend/components/dashboard/CommandBar.tsx`

Global command center: 7 **quick actions** (Start Practice, Mock Test,
Review Mistakes, Flashcards, Question Bank, Planner, Ask AI Tutor) →
**Go to** (all 10 tabs, bilingual + number hints) → **Your mistakes** +
**Exam papers** (live debounced search over real `/api/mistakes` and
`/api/exam-papers`, 2+ chars) → footer hints. Full `combobox`/`listbox`
ARIA, loading (`Searching your content…`) and empty (`No matches found`)
states.

### ExamSwitcher — `frontend/components/dashboard/ExamSwitcher.tsx`

Exam-ecosystem context picker fed by real `/api/question-bank/exams`
(falls back to the user's saved target offline; `সব পরীক্ষা` default).
Full + compact rail modes; `Escape`/outside-click close.

### NotificationCenter / LogoutButton / StreakHeatmap

Bell with unread badge → Alerts/Badges tabs, click-to-mark-read, relative
Bengali timestamps. One-line sign-out (ghost/solid, pending guard). 7-day
activity dots (`role="img"`, Bengali day labels).

## Tabs

### Home — `HomeTab.tsx`

Greeting header (time-based greeting, exam target, streak pill + heatmap,
exam countdown with Final Sprint / Focused / Steady phase) → **Today's
Mission** hero (dynamic CTA: Resume test, Start practice, Review mistakes…)
→ **Preparation Pulse** (Accuracy, Questions, Study time, Streak + deltas) →
**Continue Learning** (resume unfinished mock/quiz) + **Recommended
Actions** → **Performance Velocity** chart (Solved/Accuracy/Time ×
7D/30D/90D/ALL) + **Today's Plan** (checklist, progress, quick-add, Open AI
Planner) → **AI Study Coach** (চips: আজকের স্ট্র্যাটেজি, দুর্বল বিষয়
মেরামত, ১৫-মিনিট ড্রিল, পারফরম্যান্স অডিট; streaming answers labelled with
provider/model/latency) → Recent mock tests → Full timeline.

### Practice — `PracticeTab.tsx`

Mode switch `[CUSTOM EXAM] [MOCK_TEST] [QUICK_PRACTICE]`. Custom exam
builder (subject/topic picker, count + duration steppers, live summary,
confirm modal with `+১/−০.৫/০` scoring) → timed exam (palette, sticky timer,
unanswered-confirm) → results with negative-marking breakdown and
per-question review. Mock = same engine one-question-at-a-time. Quick =
instant drill (30s timer, resumable session). Embeds: `CustomExamTab`,
`MockTestTab`, `ScrollPractice`, `QuestionDrill`, `DailyQuizWidget`,
`SubjectTopicSelect`/`TopicTreePicker`.

### Question Bank — `QuestionBankTab.tsx`

Terminal live search (`grep -r '…'`, `<mark>` highlights, hit counter) →
বিষয়/পরীক্ষা browse toggle → All/Saved views → PYQ year, source-exam,
BCS-term pills → subject pills → bookmarkable cards → inline drill.
Exam mode → `ExamLibraryView` (Category → Exam → Paper hierarchy, paper
stats, provenance badge, Practice button).

### Mistakes — `WrongAnswerNotebookTab.tsx`

4 stat tiles → Practice CTA (`N questions need attention` / `All caught
up!`) → Mistakes-by-Subject bars → collapsible Filters (Status, 9 Bengali
error types, 6 sorts) → mistake cards (mastery + error pills, Wrong N×,
mastery bar, expandable options/explanation) → pagination → mistake-exam
builder (subject × count × focus) → drill → result screen.

### Progress — `ProgressTab.tsx`

Profile header → 9-KPI overview + mastery-distribution bar → Performance
Trend + **Exam Readiness /100** (formula shown, "not a prediction"
disclaimer) → Weak topics (≥3 attempts, Practice buttons) → Subject Mastery
matrix with topic drilldown → Mistake Recovery funnel → Leaderboard with
your rank → inline topic drills.

### Flashcards — `FlashcardsTab.tsx`

Deck grid (due/total) + review-all-due → flip-card session (hint, prev/next,
reset) → Again/Hard/Good/Easy SM-2 ratings persisted server-side.

### Planner — `StudyPlannerTab.tsx`

Day pills → focus chips → checkable tasks (optimistic toggle) → progress +
studied-minutes → `DAY COMPLETE!` state → study tip.

### Exam History — `ExamHistoryTab.tsx`

Stat tiles → type/sort filters → Upcoming exams (countdowns, official-notice
links) → expandable result rows.

### Real Exam — `RealExamTab.tsx`

Official paper browser → custom paper builder → preview with export options
→ PDF download (`real-exam-{id}-….pdf`, max 200 Qs) → offline timed attempt
with self-check scoring.

### Settings — `SettingsTab.tsx`

Profile (inline name edit) → Security (password change, revoke all) →
Preferences (theme, notifications) → Session & data (JSON export, clear
local) → Danger zone (logout, delete + confirm) → About (v0.4.0, MIT).

## Reusable command-center cards

`frontend/components/dashboard/command-center/`: `TodayMission`,
`PreparationPulse` (4 KPI deltas), `PerformanceCard` (SVG trend),
`TodayPlanCard`, `ContinueLearning`, `RecommendedActions`,
`ProgressOverview` (9 KPIs + mastery bar), `SubjectMastery` /
`SubjectMasteryMatrix`, `MistakeRecoveryCard` (Unmastered→Mastered funnel),
`ReadinessIndicatorCard`, `PreparationScoreCard` (Accuracy 55% /
Completion 35% / Streak 10%), `FocusAreasCard`, `ExamCountdownCard`,
`AITutorCard`, `AIRecommendationCard`, `QuickActions` dock
(`P/M/W/A/L/Q/F/K` hotkeys + due badges). AI overlays in `ai/`:
`HomeCoach`, `PracticeDrillOverlay` (global `ai:start-practice` modal),
`AgentBlocks`.

## States & data integrity

Every tab ships skeleton/loading, empty (e.g. `No mock tests yet` + Start
CTA), and error (`Try again`) states. All metrics derive from existing
backend endpoints — zero fabricated statistics; empty backends render honest
empty states.
