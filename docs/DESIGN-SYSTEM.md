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

- **Dashboard**: Side navigation (desktop) + bottom navigation (mobile).
- **Max width**: `max-w-4xl` for dashboard content.
- **Padding**: `p-4 md:p-6 lg:p-8`.

## Responsive Behavior

- Mobile-first approach.
- Breakpoints: `md:` (768px), `lg:` (1024px).
- Bottom nav hidden on desktop (`md:pb-0`).
- Side nav visible on desktop (`md:ml-64`).

## Accessibility

- Interactive elements use semantic HTML (`button`, `a`).
- Focus visible rings: `focus-visible:ring-2 focus-visible:ring-emerald-400/60`.
- ARIA labels on icon-only buttons (e.g., notification bell).
- Known gaps: modals lack `role="dialog"`, `aria-modal`, focus traps (see `docs/technical-reports/frontend-pitfalls.md`).

## Animation

- **Library**: Framer Motion.
- **Page transitions**: `initial={{ opacity: 0, y: 10 }}` → `animate={{ opacity: 1, y: 0 }}`.
- **Micro-interactions**: `whileHover={{ y: -4 }}`, `whileTap={{ scale: 0.95 }}`.
- **Staggered delays**: `transition={{ delay: 0.15 + i * 0.05 }}`.

## Interaction Patterns

- **Tab navigation**: URL-driven via `router.push(`/dashboard?tab=${tab}`)`.
- **Theme toggle**: Persisted in `localStorage`, applied via `<html>` class.
- **Auth**: Redirect-based (middleware + client-side effects).
