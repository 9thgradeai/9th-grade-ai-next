# Dashboard Product Map — 9Th-Grade AI

Source of truth: actual repository inspection (Oct 2026). Every entry traces to a real file.
Single authenticated route: `/dashboard?tab=<id>` — 11 client-switched tabs, URL is source of truth
(`app/dashboard/page.tsx:75-93`). Auth edge: `proxy.ts` (JWT signature check); deep checks per route
(`getUserIdFromRequest` → 401). Second client gate: `EmailVerificationGate` in `app/dashboard/layout.tsx`.

## Route / tab inventory

| Route (?tab=) | Component | Purpose / primary goal |
|---|---|---|
| `home` | `HomeTab.tsx` (+ `command-center/*` 17 cards) | Daily briefing: mission, pulse, plan, recommendations, continue-learning |
| `practice` | `PracticeTab.tsx` (hub: quick + embeds `CustomExamTab`, `MockTestTab`) | Build and take practice/mock sessions |
| `question-bank` | `QuestionBankTab.tsx` + `ExamLibraryView.tsx`, `ScrollPractice.tsx` | Browse PYQ by exam tree / infinite practice list |
| `mistakes` | `WrongAnswerNotebookTab.tsx` + `QuestionDrill.tsx` | Mistake review + mistake-exam drill |
| `progress` | `ProgressTab.tsx` | Intelligence, trends, weak-topic drill, leaderboard |
| `flashcards` | `FlashcardsTab.tsx` | SRS flashcard review (per-user `FlashcardUserState`) |
| `study-planner` | `StudyPlannerTab.tsx` | Template tasks + per-user completion |
| `exam-history` | `ExamHistoryTab.tsx` | Graded attempt history + PDF export |
| `real-exam` | `RealExamTab.tsx` | Official-paper preview/offline take + printable export |
| `vocab` | `VocabTab.tsx` (+ `vocab/*`) | Word learn/quiz/idioms, AI mnemonics |
| `settings` | `SettingsTab.tsx` | Profile, notifications prefs, theme, BYOS storage, danger zone |

Supporting authenticated surfaces: `/onboarding`, `/verify-email`, `/admin` (role-gated),
`/api/*` (~105 route files). Public: `/`, `/login`, `/blog`, marketing pages.

## Navigation

- Desktop (≥lg): `SideNav.tsx` fixed 264px/80px collapsed, `NAV_GROUPS` (Primary/Study/Account).
- Mobile (<lg): `BottomNav.tsx` fixed bottom (`--bottom-nav-h:64px`), 5 primary tabs + More sheet (6 more).
- Drawer (<lg): hamburger → 300px `SideNavDrawerContent` reusing `NavRows`.
- Header: breadcrumb, ⌘K `CommandBar`, ecosystem toggle (BCS/Bank), notifications, theme, language, `?` shortcuts.
- Keyboard: `1–9/0` jump to tabs.

## Data sources per tab

| Tab | API dependencies | DB dependencies |
|---|---|---|
| home | `preparationIntelligence(+scopes)`, `dashboardStats`, `dailyQuiz`, `examSchedule`, `mockTestResults`, `ai/opening` | `QuestionAttempt` aggregates, `UserProgress`, `DailyQuiz+Participation`, `StudyTask+Completion`, `FlashcardUserState`, `AIMemory` |
| practice | `examConfig`, `questions`, `practice/submit`, `ai/explain` | `Question`, `Subject/Topic`, `QuestionAttempt`, `UserQuestionProgress` |
| question-bank | `questionBankCategories`, `examLibrary`, `examPapers`, `questions`, `bookmarks` | `Question` (PYQ `paperId NOT NULL`), `ExamCategory→Exam→Paper`, `Bookmark` |
| mistakes | `mistakes`, `mistakeStats`, `wrongAnswers`, `mistakeExamSelection` | `UserQuestionProgress` (`isMistake`), `QuestionAttempt` |
| progress | `preparationIntelligence`, `subjectReports`, `leaderboard`, `weakTopics` | aggregates + `UserProgress` |
| flashcards | `flashcards`, `flashcards/review` | `Flashcard` + `FlashcardUserState` |
| planner | `studyPlan`, `tasks/[id]/toggle` | `StudyPlanDay` + `StudyTaskCompletion` |
| exam-history | `examHistory`, `mockTestResults`, `real-exam/export` | `ExamAttempt` + `MockTestResult` |
| real-exam | `examPapers`, `examPaperQuestions`, `real-exam/export` | `ExamPaper`, `Question` |
| vocab | `vocab/*` (8), `ai/vocab` | `VocabWord` + `VocabProgress`/`UserVocabDeck` |
| settings | `account.*`, `notifications/preferences`, `storage/*` | `User`, `StorageConnection/Job/File` |

## Client vs server state

- Durable cross-tab UI: `store-ctx/dashboard.tsx` (`activeTab`, filters, `examContext`, intents) — `useSyncExternalStore`, persisted v2 (never attempt metrics).
- API scope: `ecosystem-ctx` (`BCS`/`BANGLADESH_BANK`, localStorage, storage-event sync) — distinct from store `examContext` slug (known confusion risk).
- Server state: `services/api.ts` gateway (`cachedGet` 15s LRU-100, in-flight dedupe, GET-only retries, envelope guard) — no React Query.
- Session persistence: quick (`ninth-grade-ai:practice:quick`) + mock localStorage snapshots; nothing for RealExam (in-memory only).

## AI dependencies per surface

Tutor (`AIExplanationButton`, tutor tab), Solver (`AISolverTab`), Assistant/HomeCoach (`HomeHero`, `HomeCoach`),
Agent (`AgentBlocks`, SSE), Advisor (`AdvisorTab`), Evaluator (`AnswerEvaluatorTab`), Mock-test gen (`AIMockTestTab`),
Vocab (`AIMnemonicButton`), Opening (`ai/opening` greeting), Student-model (profile read).
Full prompt/provider/quota map: `docs/AI_PRODUCT_AUDIT.md`.

## Cross-cutting concerns (all tabs)

- Loading: per-scope skeletons + `ScopeError` retry (Home/Progress); spinners elsewhere. No blank screens (static fallbacks).
- Error: Bengali per-stage messages + retry; `ApiError` normalized; failures keep last cached value.
- Empty: honest zeros for new users (`keep-going` rec, disabled mission CTA); static deck/plan fallbacks.
- Mobile: bottom nav + sheets; exam palette is wrapping grid; sticky headers/dock offset by `--bottom-nav-h` + safe-area.
- Desktop: side nav + multi-column grids; all tabs code-split via `dynamic()`.
- Accessibility: universal `:focus-visible` ring; `useDialogA11y` on 7 dialogs (gaps elsewhere — see UX audit);
  live regions on toasts/results, never on timers.
- Performance: code-split tabs, DB-side aggregates, 15s/2m caches; gaps: leaderboard streak fan-out,
  per-request taxonomy lookup, exam-submit mastery loop in txn (see architecture audit).
- Security: per-route `getUserIdFromRequest` + `assertSameOrigin`; finding: `DELETE notifications/[id]`
  missing ownership check; `POST ai/vocab` missing AI quota (see architecture audit).
- UX (top issues): zero-history Home is honest but not actionable; 5 rec intents drop context on click;
  practice result has no mistake-drill CTA; no difficulty picker; three undocumented timer semantics.
