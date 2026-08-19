# Design System

## Typography

- **Display**: Space Grotesk (`--font-space-grotesk` → `--font-display`) for
  headlines, brand, numerals (`font-display` utility).
- **Primary**: Inter (`--font-inter`)
- **Mono**: JetBrains Mono (`--font-jetbrains-mono`)
- Weights: 400 (body), 500 (medium), 600/700 (display/bold)

## Colors

- **Background**: deep `#05070c` (via `cosmic-bg` ambient layer) — dark theme default
- **Text**: `terminal-text` (CSS variable, zinc-200 equivalent)
- **Primary accent**: `emerald-500` / `emerald-400`
- **Secondary accents**: `cyan-400`, `indigo-400` (`aurora-indigo`), `amber-400`, `rose-400`, `violet-400`, `zinc-400`
- **Gradient headline**: `text-gradient` (emerald → cyan → indigo)

## Spacing

- Base unit: `4px` (Tailwind default).
- Component padding: `p-4` to `p-6` (16px–24px).
- Gap between sections: `space-y-6` (24px).

## Components

Shared primitives live in `frontend/components/ui/`:

### ErrorBoundary
- Class-based error boundary wrapping risky surfaces.
- File: `frontend/components/ui/ErrorBoundary.tsx`.

### AnimatedList
- Staggered list container (`staggerChildren: 0.05`), reduced-motion aware.
- File: `frontend/components/ui/AnimatedList.tsx`.

### Reveal
- Scroll-reveal wrapper (fade + rise + blur), `whileInView` once, reduced-motion aware.
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
- **Shadows**: `--shadow-neon-glow`, `--shadow-neon-glow-lg`,
  `--shadow-card-hover`, `--shadow-glow-purple`, `--shadow-panel`.

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
- **Performance**: only GPU-accelerated properties (`opacity`, `transform`)
  are animated; layout effects use `layoutId`/`layout` rather than `width`/`height`;
  scroll reveals use `viewport={{ once: true }}` so they don't re-run.

## Interaction Patterns

- **Tab navigation**: URL-driven via `router.push(`/dashboard?tab=${tab}`)`.
- **Theme toggle**: Persisted in `localStorage`, applied via `<html>` class.
- **Auth**: Redirect-based (middleware + client-side effects).
