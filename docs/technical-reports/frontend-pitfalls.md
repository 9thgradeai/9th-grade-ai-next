# Front-End Pitfalls Report — `9th-grade-ai`

> Next.js 16 study platform ("9th-grade-ai"). Scanned ~9,100 lines across 60 files:
> landing page, dashboard (8 tabs), lib/hooks, auth API, global styles.
>
> Status: `tsc --noEmit` passes. Lint: **10 errors + 27 warnings**. Tests: **28/28 pass**.

---

## 🔴 Critical — breaks the app / corrupts state

| # | File | Issue |
|---|------|-------|
| 1 | `lib/theme-context.tsx:41-43` | The provider **withholds `ThemeContext.Provider` until `mounted` flips true** (`if (!mounted) return <>{children}</>`). `ThemeToggle` is rendered unconditionally in `dashboard/layout.tsx` and calls `useTheme()` during that window → **throws "useTheme must be used within a ThemeProvider", crashing the dashboard's first render**. Must always wrap; gate only the class application. |
| 2 | `components/dashboard/FlashcardsTab.tsx:54-57` | **Direct state mutation**: `card.repetitions += 1`, `card.interval = …`, `card.nextReview = …`, `card.easeFactor = …` mutate objects inside `reviewQueue` state directly (then set a new array that's already mutated). Breaks React's change detection; rating state silently desyncs. |
| 3 | `components/AITutorModal.tsx:9` + `components/dashboard/VoiceAITutor.tsx:9` | **Module-level mutable `let nextMsgId = 0`** shared across instances. Multiple mounts/remounts collide; message IDs can duplicate or skip. Should be `useRef`/`useId()`. |

---

## 🟠 High — correctness, accessibility, or invalid output

| # | File | Issue |
|---|------|-------|
| 4 | `app/dashboard/layout.tsx:33` | `router.replace("/login")` called **during render** (`if (!user) { router.replace(...) }`). Side-effect in render → React warning, double-redirects, and protected content flashes before redirect. |
| 5 | `lib/store/dashboard.tsx:72` | `useState(loadState)` reads `localStorage` during the **initial hydration render**. Server ships `defaultState`; if stored state differs (it usually does — `totalPoints`), this is a **hydration mismatch**. Load in `useEffect` instead. |
| 6 | `app/dashboard/layout.tsx` (whole) | Route protection is **client-side only**. No `middleware.ts` guards `/dashboard`; server-rendered protected markup flashes and is exposed before the client redirect. |
| 7 | `components/dashboard/PricingMatrix.tsx:213-228` | **Invalid HTML**: `<Link>` (anchor) wraps a `<motion.button>`. Interactive element inside interactive element → invalid DOM, broken click/focus semantics. |
| 8 | `globals.css` (multiple) | **Invalid CSS color syntax**: `#10B981/20`, `#10B981/30`, `#10B981/50` etc. (e.g. `--color-terminal-border`, scrollbar, selection, `.terminal-window-bar` border). Hex can't contain `/20`. These resolve to invalid → `border-terminal-border` (used everywhere) and scrollbar/selection styling silently **don't render**. Likely meant `rgb(16 185 129 / 0.2)`. |
| 9 | `components/dashboard/VoiceAITutor.tsx` | Tutor modal is **inaccessible**: no `role="dialog"`, `aria-modal`, `aria-labelledby`, or focus trap; preset chips are `<motion.div onClick>` (not buttons); status changes (`LISTENING`/`SPEAKING`) aren't in a live region. |
| 10 | `components/AITutorModal.tsx` | Modal lacks `aria-labelledby`; saved/bookmark state stored as per-ID objects for a single-shown item; keydown listener re-binds on every `onClose` change. |
| 11 | `components/dashboard/TerminalHeader.tsx:82-95` | Mobile menu has `aria-expanded` but **no `aria-controls`/`id`/`role="menu"`**, no focus trap; collapsed menu uses `height:auto` animation that breaks SR navigation. |

---

## 🟡 Medium — performance, patterns, UX

### Performance
- `lib/store/dashboard.tsx:148-161` — `ctx` is a fresh object every render, **no selectors**; any of ~12 fields changing re-renders every consumer in all 8 tabs. (Packages list the *intent* of Zustand but it's actually React Context everywhere — the classic Context re-render storm.)
- `components/dashboard/SyllabusExplorer.tsx` — **3,800+ lines of hardcoded syllabus data inside the component** (bundle bloat); `totalQuestions`/`totalCompleted`/`overallProgress`/etc. recomputed every render (wrap in `useMemo`); collapsed categories still mount all topic children.
- `components/dashboard/ProgressTab.tsx` — sub-components (`DailyPointsChart`, `SubjectReportRow`, `Toast`) defined inline and recreated every parent render.
- `components/dashboard/HomeTab.tsx` / `VoiceAITutor.tsx` — `ProgressGauge` SVG chart and `DailyPointsChart` have **no accessible text/`role="img"`** for screen readers.

### React anti-patterns / hygiene
- `components/dashboard/OfflineModeTab.tsx:19` & `lib/theme-context.tsx:19` — lint **error** `react-hooks/set-state-in-effect` (synchronous `setState` in effect).
- `lib/store/dashboard.tsx` — `addMockTestScore` increments `totalPoints` while a separate `setTotalPoints` also exists (overlapping mutation paths).
- `lib/auth-context.tsx` — `checkAuth` runs once, **no token refresh/expiry handling**; `logout` has no `try/catch` and pushes `/` even if the fetch fails (cookie may linger); `res.json()` results are untyped (`any`).
- `lib/user-store.ts` — read-modify-write `users.json` with **no locking/atomic rename** (concurrent registers can lose users); `createUser` returns the full record **including `passwordHash`** (unsafe-by-default contract relying on callers to strip it).
- `lib/auth.ts` — JWT is stateless, 7-day expiry, **no revocation/rotation**; captured tokens stay valid.
- `lib/data.ts` vs `lib/ai-data.ts` — **two divergent flash-news sources** (`FLASH_NEWS` vs `FLASH_NEWS_ITEMS`, different shapes) → drift.

### UX / data
- Mock "AI" responses are keyword-matched fake text shipped in production (`VoiceAITutor`, `AITutorModal`, `AISolverTab`) with no "demo" labeling.
- `lib/study-data.ts` — `nextReview: Date.now() + …` evaluated at **module import**, so "due" dates drift on every reload; plus garbled Bengali/encoding artifacts.
- `lib/data.ts` — `DASHBOARD_STATS.completion: 1` is ambiguous (1% vs intended 100); magic number `91.6` duplicated across 3 files.

---

## ⚪ Lint errors (must-fix for clean build)

- **10 errors**: `set-state-in-effect` (OfflineModeTab:19, theme-context:19), unescaped `'` entities (StudyPlannerTab:224, VoiceAITutor:232), `any` types (VoiceAITutor:19/28/33), `<img>` instead of `next/image` (AISolverTab:174).
- **27 warnings**: large set of **unused imports/vars** (e.g. `DailyQuizWidget` imports `XCircle`, `MockQuestion`, unused `setQuiz`; `NotificationCenter` unused `setBadges`, `getTypeColor`; test file imports unused `ThemeToggle`, `ThemeProvider`, `STUDY_PLAN`, etc.).

---

## Remediation priority

1. **Fix the crash & state bugs** (#1, #2, #3, #5) — correctness-breaking.
2. **Fix the invalid CSS colors** (#8) — silently breaks borders/scrollbars app-wide.
3. **Fix the `router.replace` during render & add server-side route guard** (#4, #6).
4. **Accessibility sweep** on modals/menus/charts (#9, #10, #11).
5. **Performance**: extract `SyllabusExplorer` data, add store selectors, memoize.
6. **Clear lint errors + unused code**, de-duplicate flash-news sources.
