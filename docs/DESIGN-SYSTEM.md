# Design System

## Typography

- **Display**: Space Grotesk (`--font-space-grotesk` → `--font-display`) for
  headlines, brand, numerals (`font-display` utility).
- **Primary**: Inter (`--font-inter`)
- **Mono**: JetBrains Mono (`--font-jetbrains-mono`)
- Weights: 400 (body), 500 (medium), 600/700 (display/bold)

## Colors

- **Background**: deep space `#04060f` (via `cosmic-bg` aurora wash) — dark theme default
- **Text**: `--foreground` `#e7ecff` (cool white)
- **Brand spectrum ("Aurora Iris")**: signal **teal** (`emerald-*` tokens retuned to
  `#14b8a6`/`#2dd4bf`) → cyan bridge `#22d3ee` → **iris** violet `#a78bfa`/`#818cf8`
  → magenta spark `#e879f9`
- Semantic token NAMES are unchanged (components still author `emerald-400`,
  etc.); only values were remapped in `app/globals.css`, so light mode's
  token-inversion strategy keeps working (light maps the scale to teal-600
  family). Teal remains in the green family to preserve success semantics.
- **Gradient headline**: `text-gradient` (teal → cyan → iris → magenta)

## Spacing

- Base unit: `4px` (Tailwind default).
- Component padding: `p-4` to `p-6` (16px–24px).
- Gap between sections: `space-y-6` (24px).

## Components

Shared primitives live in `frontend/components/ui/`:

### Button
- Single button primitive (`variant`: primary/secondary/ghost, `size`: sm/md/lg).
- Renders a Next.js `<Link>` when `href` is passed — CTAs never hard-reload.
- Micro-interactions are pure CSS transforms; no client JS required.
- File: `frontend/components/ui/Button.tsx`.

### EmptyState
- Icon + title + hint + action block; the only empty-state treatment.
- File: `frontend/components/ui/EmptyState.tsx`.

### KpiTile
- Unified stat tile (label/value/hint/accent/loading) used by dashboard home,
  progress, and result screens.
- File: `frontend/components/ui/KpiTile.tsx`.

### TerminalFrame / CardHeader
- Signature terminal-window chrome (traffic-light dots are decorative) plus
  the mono section-header row for dashboard cards.
- File: `frontend/components/ui/TerminalFrame.tsx`.
- Styles for `.terminal-window-bar` / `.dot` live in `app/globals.css`.

### Skeleton / SkeletonCard
- Loading placeholders (`role="status"` on cards) for data and tab chunks.
- File: `frontend/components/ui/Skeleton.tsx`.

### AuroraOrb
- Shared ambient blurred-orb accent; caller owns positioning; scale-only
  breathing animation, static under reduced motion.
- File: `frontend/components/ui/AuroraOrb.tsx`.

### MotionText
- Word-mask reveal heading primitive (staggered rise, shared ease).
- Reduced motion renders plain text immediately.
- File: `frontend/components/ui/MotionText.tsx`.

### NeuralScene
- Signature WebGL2 environment: a **procedural neural ecosystem** — soma
  (instanced billboard cells with membrane rim, cytoplasm fbm, nucleus),
  dendritic fibers (screen-space ribbon geometry with organic curl), curved
  inter-neuron connections, and cellular micro-particles.
- **Activation system** (CPU director, seeded): cascades propagate through the
  connection graph with conduction delays; light pulses travel as shader rings;
  localized noise-threshold dissolves fragment regions into particles, then a
  reconstruction pulse re-activates them. Opening sequence: emergence → first
  hub cascade (~3.6s) → idle events every 4–8s (never identical loops).
- Zero dependencies — hand-written GLSL ES 3.00 with explicit attribute
  locations; ≤5 draw calls (lines / instanced somas / neural points /
  ambient motes / dynamic traveler points); premultiplied-over blending;
  depth + layer attenuation for cinematic parallax.
- **Centralized config** (`config.ts`): named quality presets
  (ultra/high/medium/low) with node/particle budgets + DPR caps, per-tier
  geometry, content-safe zone, activation timing — no magic numbers in the
  renderer. `PerformanceManager` adapts level via frame-time EMA with
  hysteresis (downgrade ≈2s sustained pressure, upgrade only after a ~6s
  healthy stretch); downgrades scale resolution/effects, never pop geometry.
- **Energy travelers**: warm amber vesicles ride the actual bezier fibers
  during cascades (the palette's reserved warm highlight); ambient depth
  motes are a separate dim layer, hidden at low quality.
- Pointer parallax (±3°) on fine pointers only; paused offscreen + hidden
  tab; static composed frame under reduced motion; full disposal on unmount.
- **Static SVG fallback** (`NeuralFallback.tsx`): deterministic procedural
  constellation rendered when WebGL is unavailable or init fails.
- Dev-only diagnostics: boot line (counts, gen/compile/init timings,
  quality), adaptive-level changes, `window.__NEURAL_DEBUG` hook.
- Framer Motion owns hero orchestration: scene entrance fade, scroll-linked
  opacity/translate/scale (+ blur on capable desktops).
- Mounted as a `next/dynamic` `ssr:false` island in the hero only.
- Files: `frontend/components/visual/neural/` (`NeuralScene.tsx`,
  `neuralGenerator.ts`, `activationSystem.ts`, `shaders.ts`, `config.ts`,
  `performance-manager.ts`, `NeuralFallback.tsx`, `seededRandom.ts`).
  Unit tests: `tests/unit/frontend/neural-{config,generator,fallback}*.test.*`,
  `performance-manager.test.ts`.

### ErrorBoundary
- Class-based error boundary wrapping risky surfaces.
- File: `frontend/components/ui/ErrorBoundary.tsx`.

### AnimatedList
- Staggered list container (`staggerChildren: 0.05`), reduced-motion aware.
- File: `frontend/components/ui/AnimatedList.tsx`.

### Reveal
- Scroll-reveal wrapper (fade + rise), `whileInView` once, reduced-motion aware.
- The `as` prop renders the matching semantic tag in BOTH branches.
- File: `frontend/components/ui/Reveal.tsx`.

### SpotlightCard
- Card with cursor-tracked radial spotlight (`useMotionTemplate`), GPU-only.
- File: `frontend/components/ui/SpotlightCard.tsx`.

### SectionHeading
- Standard eyebrow + display title + description block used by landing sections.
- File: `frontend/components/ui/SectionHeading.tsx`.

### StatusPill
- Live "all systems operational" indicator with pulsing dot.
- File: `frontend/components/ui/StatusPill.tsx`.

### ScrollProgress
- Fixed top scroll-progress bar (`useScroll` + spring), reduced-motion aware.
- File: `frontend/components/ui/ScrollProgress.tsx`.

## Surfaces & Tokens

Defined in `app/globals.css`:

- **`cosmic-bg`**: fixed ambient background layer (aurora radial gradients +
  masked grid) mounted in the root layout behind all routes.
- **`noise`**: fixed film-grain overlay (`z-60`, pointer-events none) for
  premium texture.
- **`glass`**: theme-aware translucent surface (backdrop blur + saturate).
- **`glass-card`**: elevated card surface with inner highlight; used across
  landing and dashboard cards.
- **`text-gradient`**: emerald → cyan → indigo (or muted in light mode)
  gradient text for headlines and numerals.
- **`glow-border`**: animated gradient ring around primary CTAs (CSS mask).
- **`section-eyebrow`**: mono uppercase eyebrow label style.
- **`terminal-window-bar` + `.dot.*`**: terminal chrome styles backing
  `TerminalFrame`.
- **Shadows**: `--shadow-neon-glow`, `--shadow-glow`, `--shadow-glow-sm`,
  `--shadow-glow-lg`, `--shadow-card-hover`, `--shadow-glow-purple`,
  `--shadow-panel`. Use these tokens — arbitrary glow shadows in components
  are a lint-review smell.

## Layout

- **Dashboard**: Side navigation (desktop `lg:`, ≥1024px) + bottom navigation (below `lg:`).
- **Top header**: Sticky responsive header with page title (desktop), logo (mobile), theme toggle, and notification bell.
- **Max width**: `max-w-6xl` for dashboard content.
- **Padding**: `p-4 sm:p-6 lg:p-8` for dashboard content; `px-4 sm:px-6` for landing sections.
- **Bottom nav**: min `56px` touch targets, `pb-safe` for iOS home indicator, 5 primary tabs + "More" bottom sheet for overflow tabs.

## Responsive Behavior

- Mobile-first approach (default styles are mobile; scale up with `sm:`, `lg:`).
- Breakpoints: `sm:` (640px), `lg:` (1024px) for navigation switching.
- Bottom nav hidden on desktop (`lg:hidden`).
- Side nav visible on desktop (`hidden lg:flex` + `lg:ml-64`).
- `viewport-fit=cover` + `pt-safe`/`pb-safe` utilities for iOS safe areas.
- No horizontal scroll: content uses `min-w-0`, fluid grids, and `overflow-x-auto` only for genuinely scrollable strips.

## Accessibility

- Interactive elements use semantic HTML (`button`, `a`).
- Focus visible rings: `focus-visible:ring-2 focus-visible:ring-emerald-400/60` + global `:focus-visible` outline.
- ARIA labels on icon-only buttons (e.g., notification bell).
- Modals/overlays expose `role="dialog"`, `aria-modal="true"`, Escape-to-close, and Tab focus traps (NotificationCenter, DailyQuizWidget, FlashNewsModal, VoiceAITutor).
- No emojis as structural icons — SVG icons from `lucide-react`.
- Touch targets ≥44px on mobile; WCAG 2.2 pointer targets ≥24px on web.
- `prefers-reduced-motion` respected globally; `scroll-padding-top` keeps anchored sections clear of the fixed header.

## Animation

- **Library**: Framer Motion (declarative `motion` + `AnimatePresence`).
- **Global reduced motion**: the root layout wraps the app in
  `<MotionConfig reducedMotion="user">`, so every Framer Motion animation
  respects the OS `prefers-reduced-motion` setting automatically.
- **Page transitions**: `app/template.tsx` wraps every route in a fade/slide
  (`initial={{ opacity: 0, y: 20 }}` → `animate={{ opacity: 1, y: 0 }}`).
- **Dashboard tab transitions**: `app/dashboard/page.tsx` animates tab switches
  with `<AnimatePresence mode="wait">`, keyed by the active tab.
- **Cinematic hero**: `TerminalHero` uses a staggered `Variants` entrance,
  animated aurora orbs, count-up stat meters (`useInView` + rAF), magnetic
  CTAs, and a 3D pointer-tilt on the terminal card.
- **Reusable primitives** in `frontend/components/ui/`:
  - `AnimatedList` — staggered list container (`staggerChildren: 0.05`).
- **Transition presets**: `frontend/lib/transitions.ts` exports `transitions`
  (`spring`, `springBouncy`, `springStiff`, `smooth`, `snappy`).
- **Micro-interactions**: `whileHover` / `whileTap` springs on CTAs, nav links,
  cards, and icons; shared-element `layoutId` underlines (header) and active
  pills (auth tabs, side/bottom nav).
- **Reduced motion**: new animations read `useReducedMotion()` and fall back to
  opacity-only, zero-duration transitions (alongside `MotionConfig`).
- **Performance**: only GPU-accelerated properties (`opacity`, `transform`) are
  animated; progress bars use `scaleX` (never `width`); layout effects use
  `layoutId`/`layout` rather than `width`/`height`; scroll reveals use
  `viewport={{ once: true }}` so they don't re-run.

## Data Honesty

- Public-facing surfaces must not present fabricated telemetry or fake personal
  state as real. The footer shows product facts, not invented latency/user
  counts; the landing syllabus browser shows question-bank coverage and study
  estimates, not a visitor's (nonexistent) progress. Authenticated progress
  comes from `/api/progress` and `/api/dashboard-stats`.

## Interaction Patterns

- **Tab navigation**: URL-driven via `router.push(`/dashboard?tab=${tab}`)`.
- **Theme toggle**: Persisted in `localStorage`, applied via `<html>` class.
- **Auth**: Redirect-based (middleware + client-side effects).
