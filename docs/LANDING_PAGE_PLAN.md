# Plan: Product Landing Page Inspired by OpenMontage.video

## Audit Summary

**Product:** OpenMontage — desktop AI video studio (Windows, private alpha).
**Aesthetic:** Cinematic, editorial, agent-led. Premium but approachable. Monochrome-leaning palette with a single accent, large display typography, full-bleed media, restrained motion, 60fps-feel scroll reveals.

### Visual Identity
- Mark: SVG monogram.
- Palette: bg near-black #0a0a0a -> warm off-black #11100f + grain; FG warm white #f5f3ef, muted #a8a29e, tertiary #78716c; accent warm coral/amber CTAs; hairline borders rgba(255,255,255,0.08); soft layered shadows.
- Typography: display serif + grotesque; body 16-18px; headlines 64-96px desktop / 36-48px mobile; italic emphasis motif.
- Motion: transform/opacity only, GPU-accelerated, IntersectionObserver reveals, 60fps, parallax, horizontal scrub carousel, sticky timeline.

### Header/Navbar
Fixed top, translucent dark + backdrop-blur; logo left; nav center; socials + CTA right; mobile drawer; skip link.

### Section Inventory
1 Hero; 2 Made-with gallery; 3 How it works 9 steps; 4 Works with AI agent; 5 Desktop app; 6 No lock-in; 7 FAQ; 8 Waitlist CTA; 9 Follow along; 10 Footer.

### Tickets
- [x] L-1 scoped tokens + type scale (`.om-scope` in `app/globals.css`)
- [x] L-2 Header with mobile drawer (`OmHeader`)
- [x] L-3 Footer (`OmFooter`)
- [x] L-4 Hero + example request card (`OmHero`)
- [x] L-5 Exam gallery carousel (`OmGallery`)
- [x] L-6 How-it-works 9-step timeline (`OmHowItWorks`)
- [x] L-7 Agent section + bilingual tutor terminal (`OmAgentSection`)
- [x] L-8 Workspace section + UI illustration (`OmStudioSection`)
- [x] L-9 No lock-in grid (`OmNoLockIn`)
- [x] L-10 FAQ accordion using native `<details>` (`OmFaq`)
- [x] L-11 CTA section (`OmCta`) — adapted from waitlist to free signup
- [x] L-12 IntersectionObserver reveals + reduced-motion guard (`Reveal`)
- [x] L-13 a11y + responsive + lint/typecheck/build verified

**Implementation notes**
- Composition: `frontend/components/landing/om/OmLanding.tsx`, wired from `app/page.tsx`.
- Content is rewritten for the 9Th-Grade AI niche (BCS, Bank, Teacher recruitment, 9th-grade posts); layout/interaction patterns follow OpenMontage.
- Waitlist was replaced with a free-account CTA because the product is already live and free; no new API or DB model was needed.
- Motion is transform/opacity only, CSS-driven after a single IntersectionObserver, and disabled under `prefers-reduced-motion`.

### Acceptance
Lighthouse perf>=90, a11y>=95; renders 375/768/1280; waitlist 200/400; reduced-motion; CLS<0.1.
