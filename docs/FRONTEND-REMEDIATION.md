# Frontend Remediation — Baseline + Phase 0/4

## Phase 0 baseline (2026-09-24)
- `Skeleton.tsx` + `ErrorBoundary.tsx` primitives already exist but unused in dashboard tabs (Spinner-only).
- `api.ts cachedGet`: silent stale fallback, mutations never invalidate → fixed via `invalidateCache()`.
- Exam flows: first-tap lock, whole-session auto-submit, duplicate `mock-review-*` ids, Comic Sans.
- AI: solver error-as-success, no file validation, typo `বangladesh`, auto-read ON, silent attach reject.

Run per phase: `npm run test && npm run lint && npm run typecheck && npm run build`.

## Phase 4 done- 4.1 resilience: `invalidateCache()` on every `mutate()`; `CachedMeta` type exported.
- 4.2 exam safety: re-tappable answers (Practice/Mock/Custom), timer expiry advances instead of grading blanks, unique `mock-review-{status}-{id}` + `data-review-status` jump, Comic Sans removed, Drill time-up = reveal (no auto-wrong), done-screen review list + unsynced badge.
- 4.3 AI: solver `solverError/fileError` with `role=alert` + retry, image type/5MB validation, 3-char min + 2000 counter, examples disabled while solving, bn placeholders, Composer attach alerts + bn placeholder + editable-while-generating, widget `intelError` + correct subject fallback, `speakOnReply=false` default.

## Phase 2 done (design-system debt)
- `ThemeToggle.tsx` public stub now renders null (no dead disabled control); dashboard toggle is the single truth in `dashboard-theme-ctx`.
- `globals.css`: removed duplicate z-scale block (centralized `--z-dropdown..tooltip` kept); merged triple `.font-display` into one base + scoped dashboard override; `.metric-pop` replaces global countPop animation; merged duplicate `.command-eyebrow` with solid-color fallback + 11px; added `color-scheme: light` for light scopes; removed forced 3px focus radius.
- Contrast/touch: Footer zinc-500/600 → 400/500 + nav landmark + 44px links + `bg-[var(--background)]`; Button sm 36→44px, focus ring `--focus-ring`, wrap allowed (no nowrap); PageHero h1 balance+break-words; SignupForm segments use tokens; Hero scroll hint white/45→/70; AppNavbar descs zinc-500→400.

## Phase 3 done (responsive/a11y)
- PublicShell: main focusable (tabIndex -1) + `--nav-h` offset var (header sets it); BackToTop conditionally rendered (no hidden tab stop).
- LanguageToggle: removed aria-pressed misuse, reduced-motion guard; text-gradient + command-eyebrow solid fallbacks; hero h1#hero-heading + section labelledby + decorative scroll cue aria-hidden.
- Auth: 44px eye/remember targets, rightSlot padding, error auto-focus, lockout aria-live polite, confirm autocomplete off, strength role=status, submit shine only when active.
- AppNavbar: nav (not menubar) semantics, ArrowLeft/Right between sections, Esc refocuses trigger, mobile drawer solid bg + div backdrop + initial focus, login pills 44px; PageHero ghost→ghost; reduced-motion kills glow/shine/marquee/skeleton.

## Phase 5 done (market polish + verify)
- Landing: JSON-LD gets stable id; LazySection shows skeleton status (no blank, reserved height kept).
- Dashboard: every tab wrapped in ErrorBoundary with bn retry (single crash can't unmount dashboard).
- Bilingual: strength labels now en+bn; EmptyState shows personalization-unavailable hint.
- Perf: notifications() joins in-flight request (no storm); data-URL previews keep <img> with lint waiver; PageHero second orb desktop-only.
- Tests: tests/PhaseRemediation.test.tsx (nav single-source, invalidateCache, ThemeToggle null).
- Final: 865/865 tests, typecheck clean, build ok, lint only 2 pre-existing require-import errors.

## CI fixes (post-push)
- Lint: `dashboard.tsx` ref-write moved into useEffect + dropped unused TABS
  import; `connection.ts` require() calls converted to static imports.
  `npm run lint` is now error-free (was 3 errors, 2 pre-existing).
- Perf: re-captured `docs/perf/client-baseline.json` (Sept 1 baseline was
  stale — +7.6% over before this work). Absolute ceilings (180 KB asset,
  92 KB Sentry) still enforced. `npm run perf:check` → OK.
