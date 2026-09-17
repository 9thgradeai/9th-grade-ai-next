# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/9th-grade-ai/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** 9th-Grade AI — BCS + Bank exam prep (Bangladesh)
**Generated:** 2026-09-17 — curated from `ui-ux-pro-max` Academic Journal + Minimalism Swiss + existing dashboard tokens
**Dials:** VARIANCE 5 / MOTION 4 / DENSITY 6 (dashboard) · 4 (marketing)
**Source query:** `exam prep education dashboard bilingual student trust academic`

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable | Maps to existing |
|------|-----|--------------|------------------|
| Primary | `#0D9488` | `--color-primary` | `--dashboard-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` | `--dashboard-text-inverse` |
| Secondary | `#1E3A5F` | `--color-secondary` | `--dashboard-text-primary` (navy) |
| On Secondary | `#FFFFFF` | `--color-on-secondary` | — |
| Accent/CTA | `#B45309` | `--color-accent` | `--accent` (amber CTA, keep locked) |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` | — |
| Background | `#F8FAFC` | `--color-background` | `--dashboard-background` |
| Foreground | `#0F172A` | `--color-foreground` | `--dashboard-text-primary` |
| Card | `#FFFFFF` | `--color-card` | `--dashboard-surface` |
| Card Foreground | `#0F172A` | `--color-card-foreground` | — |
| Muted | `#E9EEF5` | `--color-muted` | `--dashboard-surface-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` | `--dashboard-text-muted` |
| Border | `#CBD5E1` | `--color-border` | `--dashboard-border-muted` |
| Destructive | `#DC2626` | `--color-destructive` | `--dashboard-danger` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` | — |
| Ring | `#0D9488` | `--color-ring` | `--dashboard-focus-ring` |

**Color Notes:** Trust navy + teal primary + amber CTA. **One accent lock** (taste-skill §4.2): amber `#B45309` is the ONLY CTA/accent across the whole app — no per-page teal/blue/rose drift. Audit every CTA before ship. Teal `#0D9488` is the interactive primary (links, toggles, progress). Navy `#1E3A5F` is the scholarly anchor (headings, side nav active).

**Do not confuse `--accent` (CTA amber) with `--dashboard-primary` (teal interactive). CTA buttons = amber. Toggle active / links / progress = teal.**

### Typography

- **Heading Font:** Geist (`next/font` — already in project) + fallback `Noto Sans Bengali` for Bangla measure
- **Body Font:** Geist Sans + `Noto Sans Bengali`
- **Mono:** Geist Mono for `//` labels, counts, timers
- **Mood:** trust-first, academic premium, calm, bilingual
- **Weights:** 400 body, 500 medium, 600 semibold, 700 bold — no extra loads
- **Bangla measure:** `Noto Sans Bengali` via `next/font/google` with `subsets: ["bengali","latin"]`, `display: swap`

**CSS Import (when next/font not used):**
```css
/* Prefer next/font/google in app/layout.tsx — this is fallback */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');
```

**Why not Crimson/Atkinson (original generation):** neither covers Bengali glyphs. Geist + Noto Sans Bengali keeps Latin/Bangla in one vertical rhythm.

### Spacing Variables

| Token | Value | Usage | Density 6 override |
|-------|-------|-------|--------------------|
| `--space-xs` | `4px` | Tight gaps | — |
| `--space-sm` | `8px` | Icon gaps | — |
| `--space-md` | `16px` | Standard padding | — |
| `--space-lg` | `24px` | Section padding | — |
| `--space-xl` | `32px` | Large gaps | `28px` on dashboard |
| `--space-2xl` | `48px` | Section margins | `40px` on dashboard |
| `--space-3xl` | `64px` | Hero padding | `48px` on dashboard |

Dashboard is density 6 (data-dense) → compress `xl/2xl/3xl` by ~12%. Marketing pages stay at 4 (airy).

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images |

Use `var(--dashboard-shadow-sm/md/lg)` where they exist — don't duplicate.

---

## Motion System (design-motion-principles — Emil weighted for exam context)

- **Frequency Gate:** exam interactions are **frequent (100s/day)** → no delight, instant or <200ms.
- **Enter:** 180ms `easeOut` (`cubic-bezier(0.16,1,0.3,1)`), 8px y-offset + opacity 0→1. One stagger layer only (cards), `stagger 40ms`.
- **Exit:** 150ms `easeIn`, faster than enter.
- **Springs (drawer/modal):** `stiffness 340 damping 32` (already in dashboard drawer).
- **Hover:** 150-200ms, opacity/border only — **no layout-shifting scale** (anti-pattern).
- **Reduced motion:** `MotionConfig reducedMotion="user"` already in `app/dashboard/layout.tsx` — every new `motion.*` must be inside it. Provide static final state when `prefers-reduced-motion: reduce`.
- **No animation on:** keyboard-initiated focus moves, tap feedback (use 80ms opacity only).

## Component Specs

### Buttons

```css
.btn-primary { background: var(--color-accent); color: var(--color-on-accent); padding: 12px 24px; border-radius: 8px; font-weight: 600; transition: opacity 200ms ease, transform 200ms ease; cursor: pointer; }
.btn-primary:hover { opacity: 0.92; }
.btn-primary:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
.btn-secondary { background: transparent; color: var(--color-secondary); border: 2px solid var(--color-secondary); padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; }
```

### Cards

```css
.card { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 12px; padding: 24px; box-shadow: var(--shadow-md); transition: border-color 200ms ease, box-shadow 200ms ease; cursor: pointer; }
.card:hover { border-color: var(--color-primary); box-shadow: var(--shadow-lg); }
```

### Inputs

```css
.input { padding: 12px 16px; border: 1px solid var(--color-border); border-radius: 8px; font-size: 16px; transition: border-color 200ms ease, box-shadow 200ms ease; }
.input:focus { border-color: var(--color-primary); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent); }
```

### Modals

```css
.modal-overlay { background: var(--overlay); backdrop-filter: blur(4px); }
.modal { background: var(--color-card); border-radius: 16px; padding: 32px; box-shadow: var(--shadow-xl); max-width: 500px; width: 90%; }
```

---

## Style Guidelines

**Style:** Minimalism & Swiss Style (taste-skill §2, §4) + Academic Journal anchor
**Keywords:** Grid system, modular, asymmetric, clean, mathematical spacing, trust-first
**Best for:** Dashboard + exam workspace (not marketing-only)
**Key Effects:** `display: grid; grid-template-columns: repeat(12,1fr); gap: 1rem;` — no flex percentage math (`w-[calc(...)]` banned). Hero `min-h-[100dvh]` not `h-screen`.

### Page Pattern

**Pattern Name:** Dashboard + Focused Exam Workspace
- **Sections:** Sticky header (ecosystem toggle + nav) > Tab shell (cards, filters) > Exam canvas (timer + progress + questions)
- **CTA Placement:** Header sticky + bottom sticky submit bar

---

## Anti-Patterns (Do NOT Use)

- ❌ Low contrast (<4.5:1 body)
- ❌ Visual clutter — one accent, one gray family (Zinc/Slate, not both)
- ❌ Motion-heavy chrome — respect Frequency Gate
- ❌ Emojis as icons — use Phosphor/Lucide single family, `strokeWidth` locked
- ❌ Missing `cursor-pointer`
- ❌ Layout-shifting hovers (`scale`, layout thrash)
- ❌ `h-screen` hero
- ❌ Flex percentage math
- ❌ AI purple/blue glow (`--dashboard-primary` is teal, not violet)
- ❌ Premium-consumer warm-paper palette as default

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (SVG only, one family)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover 150-300ms, no layout shift
- [ ] Text contrast ≥4.5:1 light + dark
- [ ] Focus states visible (keyboard)
- [ ] `prefers-reduced-motion` respected (static final state)
- [ ] Responsive 375px, 768px, 1024px, 1440px — no horizontal scroll
- [ ] No content hidden behind fixed header/bottom nav (content insets)
- [ ] 4/8dp spacing rhythm
- [ ] Touch targets ≥44px (mobile)

---

## Phase 0 Audit — Findings (2026-09-17)

**Scope:** `PracticeTab`, `CustomExamTab`, `MockTestTab`, `SubjectTopicSelect`, header `GlobalEcosystemToggle`, dashboard shell.

| Area | Finding | Severity | Fix in |
|------|---------|----------|--------|
| Ecosystem toggle | `hidden sm:flex` — invisible on mobile (<640px) | HIGH | Phase 2 — fixed in `ee1a53e` (now `flex` all breakpoints, `text 10→11px`, `360px` logo collapse) |
| Subject fetch | `getExamSelectionTree` filtered `questionCount>0` — Bank subjects hidden at 0 questions | HIGH | Fixed `c781fe6` + `1f052bb` (remove filter, per-ecosystem cache keys) |
| Subject fetch | Tabs didn't reset `loading/selection` on ecosystem change — stale list shown | MEDIUM | Fixed `1f052bb` (reset + refetch) |
| Motion | Per-question hover used no duration token, exit not faster than enter | LOW | Phase 2 — lock to 180/150ms tokens |
| Icons | Mixed Lucide + emoji legacy in some labels | LOW | Phase 2 — single-family sweep |
| A11y | Some toggle buttons missing `aria-pressed` | MEDIUM | Fixed `ee1a53e` |
| Typography | No `Noto Sans Bengali` — Bangla measured with Latin fallback | MEDIUM | Phase 1 — add via `next/font` |
| Color | Amber CTA vs teal primary used inconsistently in sub-components | LOW | Phase 2 — audit + lock |

No `prefers-reduced-motion` violations in drawer (already wrapped in `MotionConfig`). No `h-screen` found. No `w-[calc]` flex math found.
