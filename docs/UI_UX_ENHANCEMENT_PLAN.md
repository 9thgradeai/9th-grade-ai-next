# 9Th-Grade AI — UI/UX Interface, Motion & Design Enhancement Plan

> **Date:** September 2026
> **Based on:** `Leonxlnx/taste-skill`, `ui-ux-pro-max-cli` + `uipro init --ai opencode`, `kylezantos/design-motion-principles`
> **Reference Skills Loaded:** brandkit, design-taste-frontend, design-taste-frontend-v1, gpt-taste, high-end-visual-design, minimalist-ui, stitch-design-taste, imagegen-frontend-web, imagegen-frontend-mobile, image-to-code, full-output-enforcement, industrial-brutalist-ui, redesign-existing-projects
> **Status:** PLANNED — Ready for phased implementation

---

## Executive Summary

The 9Th-Grade AI product has a strong technical foundation: comprehensive design tokens, dark/light theming, Framer Motion animations, accessible components, and a well-structured Next.js + Tailwind v4 architecture. The three installed skills reveal specific gaps in typography choices, icon library consistency, motion choreography depth, and component architecture patterns. This plan addresses each gap in five phases, from quick wins (font/icon migration) to ambitious additions (GSAP scroll choreography, Double-Bezel component architecture).

---

## Current Design System Snapshot

| Aspect | Current | Skill-Aligned Target |
|--------|---------|---------------------|
| **Primary font** | Inter (`app/layout.tsx:19`) | Geist or Outfit (Inter banned by taste-skill, gpt-taste, high-end-visual-design) |
| **Display font** | Space Grotesk | Acceptable (geometric grotesk — on-brief for AI/tech) |
| **Bangla font** | Hind Siliguri | Keep (only proper Bengali face available) |
| **Icon library** | lucide-react v1.31.0 | Phosphor (`@phosphor-icons/react`) per ui-ux-pro-max, taste-skill |
| **Motion engine** | Framer Motion 13.1.0 | Keep + add GSAP for scroll choreography (gpt-taste) |
| **Easing** | `[0.22,1,0.36,1]` custom | Expand with spring physics per design-motion-principles |
| **Accent color** | Indigo/violet `#818CF8` | Keep — single accent on dark neutral base (compliant) |
| **Semantic colors** | Emerald, amber, red, blue, teal | Acceptable for data dashboard (taste-skill "max 1 accent" is for marketing pages) |
| **Card architecture** | Standard rounded cards + command-card | Add Double-Bezel nested per high-end-visual-design |
| **Hero architecture** | Centered with AuroraOrbs | Compliant — add inline image typography option per gpt-taste |
| **Reduced motion** | ✓ Full support | ✓ Maintain |
| **Dark/light mode** | ✓ Dashboard toggle, dark default | ✓ Maintain |
| **Focus rings** | ✓ ARIA focus-visible | ✓ Maintain |
| **Component inventory** | 23 UI primitives | Expand with new patterns |

---

## Phase 1: Typography & Icon Migration (Week 1)

**Impact:** Medium | **Risk:** Low | **Scope:** Foundation tokens

### 1A. Migrate Display Font from Inter → Geist

**Files:** `app/layout.tsx`, `app/globals.css`

**Rationale:** Inter is explicitly banned as a default display font by taste-skill §4.1, gpt-taste §3, high-end-visual-design §2, minimalist-ui §3, and stitch-design-taste §3. Inter is the single most common AI-generated site tell.

**Actions:**
1. Install `geist` via `next/font` (already a Next.js first-party package)
2. Replace `Inter` with `Geist` for body/sans in `app/layout.tsx`
3. Keep `Space Grotesk` for display (works well as a geometric grotesk companion to Geist)
4. Keep `Hind Siliguri` for Bangla (no substitute available)
5. Update CSS variable references in `app/globals.css`
6. Audit all `font-sans` and `font-display` usages across components for Inter references

**Expected token change in `app/layout.tsx`:**
```
--font-sans: var(--font-geist), var(--font-hind-siliguri), system-ui, sans-serif
--font-display: var(--font-space-grotesk), var(--font-geist), var(--font-hind-siliguri), system-ui, sans-serif
```

### 1B. Migrate Icons from lucide-react → Phosphor

**Files:** All 23+ component files using `lucide-react`

**Rationale:** ui-ux-pro-max explicitly recommends Phosphor (`@phosphor-icons/react`) as the primary icon library. taste-skill §3.C also recommends Phosphor. lucide-react is listed as discouraged in taste-skill §3.C.

**Actions:**
1. `npm install @phosphor-icons/react`
2. Map common lucide icons to Phosphor equivalents (systematic mapping needed)
3. Standardize `strokeWidth` to `1.5` across all icons
4. Keep lucide-react as a secondary dependency (don't force-migrate if specific icons have no Phosphor equivalent)
5. Priority: Navbar, Dashboard tabs, Command center, Landing sections

### 1C. Font Loading Optimization

**Files:** `app/layout.tsx`

**Actions:**
1. Add `preload: true` to Geist font (currently all fonts have `preload: false`)
2. Ensure `font-display: swap` is maintained
3. Total font payload should stay under ~200KB

---

## Phase 2: Motion Architecture Enhancement (Weeks 2-3)

**Impact:** High | **Risk:** Medium | **Scope:** Animation system expansion

### 2A. Add GSAP Scroll Choreography for Landing Page

**Files:** New `frontend/components/landing/` components, `app/globals.css`

**Rationale:** gpt-taste §5 requires GSAP for scroll-driven animations (pinning, horizontal scroll, scrub reveals). Currently only Framer Motion is used. The landing page has no scroll-triggered animations beyond basic fade-up (Reveal component).

**Actions:**
1. `npm install gsap`
2. Create scroll-triggered sections for landing page:
   - **Staggered reveal** for feature sections (use Motion's `whileInView` as lighter alternative per design-taste-frontend §5.C, save GSAP for pinning)
   - **Pinned section** for the Intelligence/KnowledgeGraph area — pin the section heading while the graph animates in (gpt-taste §5.B)
   - **Image scale reveal** for any landing photography (scale 0.8 → 1.0 on scroll into view)
   - **Marquee** for trusted-by/partner logos (max 1 per page per design-taste-frontend §5.A)
3. Implement with `ScrollTrigger` + `gsap.registerPlugin`
4. Honor `prefers-reduced-motion` via `useReducedMotion` from Motion

### 2B. Purposeful Motion Audit Framework

**Files:** New `frontend/lib/motion/` audit utilities, `frontend/components/ui/`

**Rationale:** design-motion-principles emphasizes that every animation must communicate something (hierarchy, storytelling, feedback, state transition). The current codebase has motion but lacks a formal audit framework.

**Actions:**
1. Create a motion audit checklist component:
   - Every `motion.div` must have a documented purpose
   - Every transition must use spring physics or custom cubic-bezier (no linear/ease-in-out)
   - All scroll listeners use `useScroll()` or `ScrollTrigger`, never `window.addEventListener("scroll")`
   - All continuous animations honor `prefers-reduced-motion`
2. Audit existing animations:
   - `Magnetic.tsx` — Already uses spring physics ✓
   - `Reveal.tsx` — Uses custom ease ✓, but add purpose documentation
   - `MotionText.tsx` — Word reveal ✓, add narrative motivation
   - `AuroraOrb.tsx` — Ambient ✓, ensure it has a design rationale
   - `ScrollProgress.tsx` — Uses passive listener + rAF ✓ (not banned)
3. Add a `motion-preferences.ts` utility that centralizes reduced-motion checks

### 2C. Spring Physics Expansion

**Files:** `frontend/lib/motion/variants.ts` (or new file)

**Rationale:** design-motion-principles emphasizes real-world mass and spring physics. The current easing `[0.22, 1, 0.36, 1]` is excellent but should be complemented with spring-based interactions.

**Actions:**
1. Create shared spring configurations:
   ```typescript
   export const SPRING = {
     soft: { type: "spring", stiffness: 100, damping: 20 },
     snappy: { type: "spring", stiffness: 300, damping: 25 },
     gentle: { type: "spring", stiffness: 60, damping: 15 },
   };
   ```
2. Apply spring physics to: hover states, tab switches, modal entries, drawer animations
3. Replace any `ease: "linear"` or `ease: "ease-in-out"` in motion components

### 2D. Magnetic Expansion

**Files:** New wrapper components for CTAs

**Rationale:** high-end-visual-design §5.B and gpt-taste §5 call for magnetic button physics. The project already has a `Magnetic` component but it's only for CTAs. Expand to cards and interactive elements.

**Actions:**
1. Create `MagneticCard` wrapper (applies subtle 3D tilt on hover + magnetic drag)
2. Apply to: dashboard cards, landing feature cards, command center cards
3. Max displacement: 4-6px for buttons, 8-12px for cards
4. Use `useMotionValue` + `useSpring` (never React state)

---

## Phase 3: Component Architecture Upgrade (Weeks 3-4)

**Impact:** High | **Risk:** Medium | **Scope:** 15+ component modifications

### 3A. Double-Bezel Card Architecture

**Files:** `frontend/components/ui/Card.tsx`, new `DoubleBezelCard.tsx`, dashboard cards

**Rationale:** high-end-visual-design §4.A mandates the "Double-Bezel" (Doppelrand) nested architecture for all premium cards. Currently cards use flat 1px borders without nested enclosures.

**Actions:**
1. Create `DoubleBezelCard` component:
   ```
   Outer shell: bg-white/5, ring-1 ring-white/10, p-1.5, rounded-[2rem]
   Inner core: bg-[surface], rounded-[calc(2rem-0.375rem)], shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]
   ```
2. Apply to: command center cards, dashboard stat cards, landing feature cards
3. Keep existing `Card` for utilitarian contexts (forms, simple containers)
4. Add `doubleBezel` prop to existing `Card` as an opt-in

### 3B. Button-in-Button Trailing Icon Pattern

**Files:** `frontend/components/ui/Button.tsx`

**Rationale:** high-end-visual-design §4.B requires that button arrows sit inside their own circular wrapper, not naked next to text.

**Actions:**
1. Add `trailingIcon` prop to Button component:
   ```tsx
   <Button trailingIcon={<ArrowUpRight />}>Get Started</Button>
   ```
2. The trailing icon renders in `w-8 h-8 rounded-full bg-white/10` nested inside the button
3. On hover, the icon circle translates diagonally and scales up
4. Apply to all primary CTAs with arrow intent across the product

### 3C. Magnetic Button Hover Physics Enhancement

**Files:** `frontend/components/ui/Button.tsx`

**Rationale:** high-end-visual-design §5.B specifies: `active:scale-[0.98]` for physical press simulation + icon kinetic tension.

**Actions:**
1. Enhance Button with `group` utility:
   - `active:scale-[0.98]` on the button
   - Inner icon circle `group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105`
2. This applies to all Button instances with trailing icons

### 3D. Staggered Navigation Reveal

**Files:** `frontend/components/navigation/AppNavbar.tsx` (mega menu panel)

**Rationale:** high-end-visual-design §5.A specifies staggered mask reveal for navigation links: `translate-y-12 opacity-0` → `translate-y-0 opacity-100` with `delay-100/150/200`.

**Actions:**
1. Enhance the desktop mega menu panel:
   - Menu items start at `translate-y-12 opacity-0`
   - Animate to `translate-y-0 opacity-100` with staggered delays
   - Use Framer Motion `staggerChildren` via `variants`
2. Mobile drawer: items stagger in with `delay: i * 50ms`
3. Hamburger morph: 2-3 lines fluidly rotate to form perfect X (already uses X icon; ensure smooth rotation)

### 3E. Skeleton Loader Enhancement

**Files:** `frontend/components/ui/Skeleton.tsx`

**Rationale:** taste-skill §4.5 requires skeletal loaders matching the final layout's shape. Current skeletons are basic lines.

**Actions:**
1. Ensure `SkeletonCard` matches the Double-Bezel card shape (after 3A)
2. Add shimmer animation CSS keyframes (currently referenced but verify implementation)
3. Add skeleton variants for: chat messages, profile data, exam results, chart containers
4. All skeletons respect `prefers-reduced-motion` (no shimmer for reduced motion users)

### 3F. Empty State Enhancement

**Files:** `frontend/components/ui/EmptyState.tsx`

**Rationale:** taste-skill §4.5 mandates beautiful empty states that indicate how to populate data.

**Actions:**
1. Current EmptyState is good — verify it appears on all empty surfaces:
   - AI workspace empty state
   - Conversation list empty
   - Flashcard deck empty
   - Study plan empty
   - Wrong answer notebook empty
2. Add `action` prop rendering with proper spacing
3. Ensure empty states have motion (fade-in via Reveal)

### 3G. Section Heading Eyebrow Restraint

**Files:** `frontend/components/ui/SectionHeading.tsx`, all section components

**Rationale:** taste-skill §4.7 (Eyebrow Restraint) mandates max 1 eyebrow per 3 sections. Currently `SectionHeading` always renders an eyebrow with `//` prefix.

**Actions:**
1. Add `showEyebrow?: boolean` prop to SectionHeading (default: true)
2. Audit all section uses: ensure ≤ ceil(totalSections/3) eyebrows total
3. Hero counts as 1 section
4. Remove eyebrows from informational sections where the headline alone suffices

---

## Phase 4: Landing Page Experience Overhaul (Weeks 4-5)

**Impact:** High | **Risk:** High | **Scope:** Full landing page rewrite

### 4A. AIDA Structure Implementation

**Files:** `app/(dashboard)/` and public landing pages

**Rationale:** gpt-taste §2 mandates AIDA framework: Attention (Hero) → Interest (Features/Bento) → Desire (GSAP Scroll/Media) → Action (Footer/Pricing).

**Actions:**
1. **Attention:** Hero already exists (`PageHero`). Ensure it fits in viewport (max 2 lines H1, max 20 words subtext, CTAs visible). Add inline image typography option per gpt-taste §3.
2. **Interest:** Convert feature sections to gapless bento grid with `grid-flow-dense`. Verify zero empty cells (gpt-taste §4).
3. **Desire:** Add GSAP scroll animations (Phase 2A). Add pinned sections. Add horizontal scroll for showcase areas.
4. **Action:** Strengthen CTA sections. Ensure single primary CTA per viewport tier. No duplicate CTA intent (taste-skill §4.5).

### 4B. Bento Grid Landing Sections

**Files:** Landing section components

**Rationale:** gpt-taste §4 mandates gapless bento with `grid-flow-dense`, mathematically verified col-span/row-span, and exactly as many cells as content items.

**Actions:**
1. Audit current landing sections for bento grid usage
2. Convert feature rows to bento grids:
   - 3 items → 3 cells (1+2 or 2+1 asymmetric split)
   - 4 items → 4 cells (2+2 asymmetric or 1+3)
   - 5 items → 5 cells (2+3 or 3+2)
3. Apply `grid-flow-dense` on every bento
4. Verify no empty cells mathematically before shipping
5. Vary bento composition across the page (no two identical bento grids)

### 4C. Landing Section Layout Variety

**Files:** All landing sections

**Rationale:** taste-skill §4.7 bans section-layout-repetition (max 1 use per layout family) and zigzag alternation cap (max 2 consecutive image+text splits).

**Actions:**
1. Audit current landing sections for repeated layout families
2. Ensure at least 4 different layout families across 8 sections:
   - Hero (centered statement)
   - Feature showcase (bento grid)
   - Social proof (testimonial carousel or quote wall)
   - Intelligence demo (interactive graph — already exists)
   - CTA (centered or split)
   - Data proof (metrics strip)
   - Feature detail (editorial split)
   - Final CTA (minimalist)
3. Break zigzag patterns with full-width sections, vertical stacks, or bento grids

### 4D. Inline Image Typography

**Files:** Landing page hero, key section headings

**Rationale:** gpt-taste §6 creates "Inline Typography Images" — small pill-shaped images embedded inside massive headings as visual punctuation.

**Actions:**
1. In hero H1, embed a small inline image (16:9 or 4:3) between words
2. Image sits at type-height, `rounded-full` or `rounded-2xl`, aligned-middle
3. On mobile, inline images stack below headline per stitch-design-taste §7
4. Use `picsum.photos/seed/{descriptive}/200/100` for placeholder or generate real assets

### 4E. Second-Read Moment

**Files:** One landing section

**Rationale:** imagegen-frontend-web §2 mandates exactly 1 unobvious but legible motif per page.

**Actions:**
1. Choose ONE section to contain a memorable motif:
   - Option A: Asymmetric bleed that still respects hierarchy
   - Option B: One oversized numeral/punctuation serving structure
   - Option C: A single unexpected material switch (paper vs gloss vs metal)
2. Implement in the most impactful section (likely the Intelligence demo or CTA section)

---

## Phase 5: Advanced Interactions & Polish (Weeks 5-6)

**Impact:** Medium | **Risk:** Medium | **Scope:** Dashboard polish, accessibility, performance

### 5A. Form Contrast Audit

**Files:** All form components across the product

**Rationale:** taste-skill §4.5 mandates WCAG AA contrast for all form elements.

**Actions:**
1. Audit every input, placeholder, helper text, error text, and focus ring
2. Ensure all pass 4.5:1 contrast ratio against section background
3. Fix any light placeholders on dark surfaces (or vice versa)
4. Priority: Login form, Signup form, Settings, Study planner inputs, Command bar

### 5B. Mobile Collapse Documentation

**Files:** All multi-column layouts

**Rationale:** All skills mandate explicit mobile collapse declarations. No "it'll work, Tailwind handles it" assumptions.

**Actions:**
1. Audit every responsive section
2. Ensure each has explicit `< 768px` fallback in the same component
3. Document with code comments: `/* mobile: collapse to single column at <768px */`
4. Priority: Dashboard tabs, Landing bento, Navigation mega menu, Knowledge graph

### 5C. Z-Index Scale Standardization

**Files:** `app/globals.css`, components using z-index

**Rationale:** taste-skill §6.F bans arbitrary `z-50` or `z-10`. Must document z-index scale.

**Actions:**
1. Create z-index scale in `app/globals.css`:
   ```css
   --z-dropdown: 40;
   --z-sticky: 50;
   --z-overlay: 60;
   --z-modal: 70;
   --z-toast: 80;
   --z-tooltip: 90;
   ```
2. Replace all arbitrary z-index values with CSS variables
3. Current: `z-[50]` (nav), `z-[60]` (mobile drawer), `z-[80]` (scroll progress) — map to scale

### 5D. AI Workspace Onboarding Flow

**Files:** `frontend/components/ai-workspace/EmptyState.tsx`, new onboarding components

**Rationale:** gpt-taste §4.5 and taste-skill §4.5 require beautiful empty states and onboarding guidance.

**Actions:**
1. Design AI workspace empty state as a "first session" onboarding:
   - Welcome message with personalized greeting
   - 3-step action cards: "Take a diagnostic test", "Ask AI tutor a question", "Start a practice session"
   - Visual progress path showing what the workspace will look like when populated
2. Add first-interaction celebration (subtle, not garish)
3. Implement after Phase 3A (Double-Bezel cards available)

### 5E. Dashboard Data Visualization Enhancement

**Files:** Dashboard tab components, `frontend/components/ui/Sparkline.tsx`, `KpiTile.tsx`

**Rationale:** ui-ux-pro-max §2 provides chart type recommendations for different data stories.

**Actions:**
1. Audit all data displays for appropriate chart types:
   - Progress tracking → Line chart with gradient fill
   - Subject mastery → Radar/polar chart
   - Streak data → Heatmap grid (existing `StreakHeatmap`)
   - Performance trends → Area chart
2. Ensure chart colors map to design tokens (not hardcoded values)
3. Add loading states for all chart containers
4. Ensure charts are accessible (aria-label, keyboard navigation)

### 5F. CSS Grain/Noise Texture (Optional)

**Files:** `app/globals.css`

**Rationale:** high-end-visual-design §3.A (Ethereal Glass archetype) and editorial luxury archetype use film grain for premium feel.

**Actions:**
1. Add CSS noise texture as fixed `pointer-events-none` pseudo-element:
   ```css
   body::before {
     position: fixed; inset: 0; z-index: 9999; pointer-events: none;
     opacity: 0.025; background-image: url("data:image/svg+xml,...");
   }
   ```
2. Apply only to landing/public pages (not dashboard — dashboard has different aesthetic)
3. Ensure reduced motion users are unaffected (it's a static texture)

---

## Implementation Priority Matrix

| Phase | Complexity | User Impact | Dependencies |
|-------|-----------|-------------|-------------|
| **1** Typography & Icons | Low | Medium | None |
| **2** Motion Architecture | Medium | High | Phase 1 (font change affects motion) |
| **3** Component Architecture | Medium | High | Phase 2 (some components need motion ready) |
| **4** Landing Page Overhaul | High | High | Phase 3 (cards, buttons must be ready) |
| **5** Polish & Accessibility | Medium | Medium | Phase 3 (cards, forms) |

---

## Metrics for Success

### Before vs After

| Metric | Before | Target |
|--------|--------|--------|
| Inter usage | Primary font | 0% (replaced by Geist) |
| lucide-react usage | All icons | < 20% (migrated to Phosphor) |
| Motion purpose documentation | Ad hoc | Every animation has a documented rationale |
| Eyebrow overuse | Every section | ≤ ceil(sections/3) total |
| Empty bento cells | Possible | Zero (verified mathematically) |
| Form contrast compliance | Unknown | 100% WCAG AA |
| Z-index consistency | Arbitrary values | CSS variable scale |
| Mobile collapse documentation | Implicit | Explicit per-section comments |
| GSAP scroll animations | 0 | ≥ 3 scroll-triggered sections on landing |
| Double-Bezel cards | 0 | All premium card surfaces |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Font migration breaks Bangla rendering | Test Hind Siliguri with Geist; keep as fallback chain |
| Phosphor migration breaks icon layout | Systematic mapping table; keep lucide as fallback |
| GSAP increases bundle size | Dynamic import GSAP only on landing page; tree-shake |
| Double-Bezel cards look different on dark mode | Test in both themes; use CSS variables for shell colors |
| Motion changes cause layout shift | All animations use `transform`/`opacity` only; no layout properties |
| Landing rewrite loses SEO | Server Components for content; dynamic import for animations |

---

## File Change Inventory

### Configuration
- `app/layout.tsx` — Font migration, preload optimization
- `app/globals.css` — Z-index scale, grain texture, token updates
- `package.json` — Add `@phosphor-icons/react`, `gsap`

### UI Primitives
- `frontend/components/ui/Button.tsx` — Trailing icon, magnetic physics
- `frontend/components/ui/Card.tsx` — Double-Bezel variant
- `frontend/components/ui/SectionHeading.tsx` — Eyebrow restraint
- `frontend/components/ui/Skeleton.tsx` — Shape-matched loaders
- `frontend/components/ui/EmptyState.tsx` — Enhanced with motion
- `frontend/components/ui/ScrollProgress.tsx` — Z-index variable

### Navigation
- `frontend/components/navigation/AppNavbar.tsx` — Staggered reveal, icon migration

### Landing Page
- `frontend/components/public/PageHero.tsx` — Inline image typography
- `frontend/components/landing/*` — Bento grids, GSAP, layout variety
- New: `frontend/components/landing/BentoGrid.tsx`
- New: `frontend/components/landing/Marquee.tsx`
- New: `frontend/components/landing/ScrollRevealGrid.tsx`

### Motion
- `frontend/lib/motion/variants.ts` — Spring configurations
- `frontend/lib/motion/audit.ts` — Motion purpose documentation
- New: `frontend/components/ui/MagneticCard.tsx`
- New: `frontend/components/ui/StaggerReveal.tsx` (using Motion whileInView)

### Dashboard
- All dashboard card components — Double-Bezel, magnetic, spring transitions
- `frontend/lib/dashboard-theme-ctx/index.tsx` — No change (already compliant)

---

## Skill Integration Reference

| Skill | Key Rules Applied | Sections Referenced |
|-------|-------------------|-------------------|
| **design-taste-frontend** | Eyebrow restraint, bento density, anti-center bias, hero fit, CTA contrast, mobile collapse | §0, §4.1-4.7, §5, §6 |
| **high-end-visual-design** | Double-Bezel, button-in-button, magnetic hover, staggered nav, scroll interpolation, haptic aesthetics | §2-6 |
| **gpt-taste** | AIDA structure, gapless bento, GSAP scroll, inline typography, hero 2-line rule, meta-label ban, gap-less grids | §1-8 |
| **stitch-design-taste** | DESIGN.md generation, semantic tokens, anti-patterns, responsive rules | §1-9 |
| **imagegen-frontend-web** | Per-section image generation, hero composition variety, CTA variation, section rhythm | §1-20 |
| **minimalist-ui** | Warm monochrome option, subtle motion philosophy, editorial typography, bento specs | §1-8 |
| **ui-ux-pro-max** | Icon library standards, a11y checklist, form contrast, touch targets, dark mode parity | §Common Rules, §Pre-Delivery |
| **design-motion-principles** | Purposeful motion, spring physics, magnetic expansion, scroll interpolation, reduced motion | Motion design patterns |
| **brandkit** | Brand consistency across sections, visual identity lock | Brand coherence |
| **redesign-existing-projects** | Audit-first approach, breaking AI patterns | Existing code review |
| **image-to-code** | Section-specific image generation, implementation-friendly references | Frontend reference images |
| **full-output-enforcement** | Complete plan generation, no placeholders | This document |

---

## Next Steps

1. **Immediate:** Install `@phosphor-icons/react` and `geist` packages
2. **Week 1:** Complete Phase 1 (typography + icon migration)
3. **Week 2-3:** Complete Phase 2 (motion architecture)
4. **Week 3-4:** Complete Phase 3 (component architecture)
5. **Week 4-5:** Complete Phase 4 (landing page overhaul)
6. **Week 5-6:** Complete Phase 5 (polish + accessibility)
7. **Post-implementation:** Run `npm run lint`, `npm run typecheck`, `npm run test`
8. **Verification:** Audit with design-motion-principles audit mode (generates branded HTML report)

---

*Generated from: taste-skill (Leonxlnx/taste-skill), ui-ux-pro-max-cli + uipro init --ai opencode, design-motion-principles (kylezantos/design-motion-principles)*
