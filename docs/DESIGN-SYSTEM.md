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

### BackToTop
- Fixed back-to-top button for public pages (appears past ~90vh, smooth
  scroll unless reduced motion). Threshold derived from Framer's scroll
  MotionValue — no scroll listener.
- File: `frontend/components/ui/BackToTop.tsx`.

### Landing experience primitives (`frontend/components/landing/`)

- **Interactive3DCard** — reusable dimensional card: pointer-tracked
  perspective tilt (±`maxRotation`, default 3°) + cursor-following border
  glow via CSS variables. Zero React state per pointer frame; disabled on
  touch, reduced motion, and low-tier devices.
- **Magnetic** — CTA wrapper drifting ≤5px toward the cursor; same gating.
- **KnowledgeField** — shared hero Canvas 2D "knowledge intelligence field"
  (drifting nodes + neural mesh). DPR capped at 1.5 (1 on low tier), particle
  count scales with area AND device tier, pauses offscreen/tab-hidden,
  renders one static frame under reduced motion or low tier.
- **Device tiers** — `frontend/lib/motion/device.ts`: `detectDeviceTier()`
  classifies high/mid/low from cores, memory, SaveData, pointer type;
  `useMotionCapabilities()` gates pointer/continuous effects after mount.
- **Motion language** — `frontend/lib/motion/variants.ts`: shared ease family
  (`EASE_OUT_EXPO`) plus `fadeRise` / `heroItem` / `staggerParent`. Micro
  150–250ms, UI 300–600ms, cinematic 600–1000ms — cinematic reserved for the
  hero entrance and the philosophy section only.

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
- **Cinematic hero**: `landing/HeroSection` uses a staggered `Variants`
  entrance, word-mask headline reveals, a Canvas 2D knowledge field with
  pointer-reactive parallax (MotionValues — no re-renders), magnetic CTAs,
  and count-up-free stat row.
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
