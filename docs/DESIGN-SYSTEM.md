# Design System

## Typography

- **Primary**: Inter (`--font-inter`)
- **Mono**: JetBrains Mono (`--font-jetbrains-mono`)
- Weights: 400 (body), 500 (medium), 700 (bold)

## Colors

- **Background**: `zinc-950` (dark theme default)
- **Text**: `terminal-text` (CSS variable, zinc-200 equivalent)
- **Primary accent**: `emerald-500` / `emerald-400`
- **Secondary accents**: `cyan-400`, `amber-400`, `rose-400`, `sky-400`, `violet-400`, `zinc-400`

## Spacing

- Base unit: `4px` (Tailwind default).
- Component padding: `p-4` to `p-6` (16px–24px).
- Gap between sections: `space-y-6` (24px).

## Components

### Badge
- Pill-shaped status indicator.
- Colors: `emerald`, `cyan`, `amber`, `rose`, `violet`, `zinc`.
- File: `frontend/components/ui/Badge.tsx`.

### Button
- Variants: `primary`, `ghost`, `elite`, `danger`, `outline`.
- Sizes: `sm`, `md`, `lg`.
- Supports `loading` and `leftIcon`.
- File: `frontend/components/ui/Button.tsx`.

### Card
- Glass/terminal card surface.
- Supports `glow` prop for neon shadow.
- File: `frontend/components/ui/Card.tsx`.

### Input
- Terminal-styled text input.
- File: `frontend/components/ui/Input.tsx`.

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

- **Library**: Framer Motion.
- **Page transitions**: `initial={{ opacity: 0, y: 10 }}` → `animate={{ opacity: 1, y: 0 }}`.
- **Micro-interactions**: `whileHover={{ y: -4 }}`, `whileTap={{ scale: 0.95 }}`.
- **Staggered delays**: `transition={{ delay: 0.15 + i * 0.05 }}`.

## Interaction Patterns

- **Tab navigation**: URL-driven via `router.push(`/dashboard?tab=${tab}`)`.
- **Theme toggle**: Persisted in `localStorage`, applied via `<html>` class.
- **Auth**: Redirect-based (middleware + client-side effects).
