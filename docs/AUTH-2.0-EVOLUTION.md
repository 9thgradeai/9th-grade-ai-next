# 9Th-Grade AI — Auth Experience 2.0

## Deep UX + Art Direction + Interaction + Visual Refinement + Performance Evolution

---

## Phase 1 — Forensic UI/UX Audit

### Element Classification

| Element | Class | Rationale |
|---------|-------|-----------|
| **Unit-9 companion** | **A — Signature** | The single most proprietary element. No other product has an LED-faced exam-hall keeper. Must be preserved and refined. |
| **Exam-hall metaphor** | **A — Signature** | Culturally specific to Bangladeshi aspirants. Serial numbers, form codes, admit cards — this IS the product's identity. |
| **Admit card ceremony** | **A — Signature** | The most satisfying moment in the flow. The stamp, barcode, seat number — deeply product-specific. |
| **Lamp interaction** | **A — Signature** | The "turn on the light" metaphor is unique. It creates a moment of intention before study. |
| **Cinematic lighting** | **B — Supporting** | The scrim → moonlight → bloom transition creates atmosphere. Works well but competes with other elements. |
| **Ember particles** | **B — Supporting** | Adds life to the environment. Currently well-gated by quality tiers. Could be quieter during form interaction. |
| **Aurora blobs** | **C — Redundant** | Three animated radial gradients in the background. They add ambient motion but compete with the lamp bloom and embers for visual attention. The cosmic-bg already provides ambient color. |
| **Floor grid** | **C — Redundant** | A holographic floor grid at the bottom. Rarely visible because the form covers it. When visible, it competes with the card texture grid. |
| **Card texture grid** | **C — Redundant** | The emerald grid lines inside the form card at 7% opacity. Nice concept (examination paper) but adds visual noise to the form surface. |
| **Pointer glow** | **C — Redundant** | A 540px radial gradient following the cursor. On capable desktops only. Adds subtle interactivity but competes with the lamp bloom for "warm light source" attention. |
| **Camera spring** | **C — Redundant** | Subtle scale/y shifts (max 2.5%) per scene. Nice but so subtle it's imperceptible. Creates unnecessary spring computation. |
| **Choice screen** | **B — Supporting** | The identification step. Well-designed but visually dense — 4 options (Google, Apple, login, signup) + demo + divider + texture. |
| **Social auth buttons** | **D — Distracting** | Standard SaaS styling with Google/Apple logos. Visually clash with the exam-hall metaphor. The most generic elements on the page. |
| **"Exam hall — secure entry" eyebrow** | **C — Redundant** | Mono text above the form. Nice context but adds another text element competing for attention. |
| **Progress dots** | **C — Redundant** | 4 dots at the bottom showing wizard progress. Subtle but adds another UI element. The form already communicates progress through its content. |
| **Security footer** | **B — Supporting** | "Secure session · Your password never leaves this page unhashed." Important trust signal. Should remain but could be quieter. |
| **"Back to home" link** | **D — Distracting** | Redundant with the logo link. Both go to `/`. Adds unnecessary header clutter. |
| **Verification sequence** | **B — Supporting** | The Identity → Credentials → Session checklist. Satisfying on signup. Unnecessarily slow on login. |
| **Dark lamp scene** | **B — Supporting** | The initial dark room with "Your exam won't wait." Beautiful but blocking first-time users. |
| **Avatar boot scanline** | **B — Supporting** | One-time power-on sweep. Nice touch but happens too fast to register for most users. |
| **Avatar wave hand** | **C — Redundant** | Animated hand on success. Charming but slightly cartoonish for the serious exam context. |
| **Sparkle effects** | **C — Redundant** | Star shapes on excellent/success states. Adds visual noise during the most important moment (success). |
| **ConstellationField/ConstellationForm** | **E — Missing (dead code)** | 415 lines of unused code implementing a more sophisticated field system with node states and connectors. Represents an unrealized visual direction. |
| **Passwordless auth** | **E — Missing** | No magic link, OTP, or passkey support. Critical for mobile-first Bangladeshi audience. |
| **Returning-user recognition** | **E — Missing** | The lamp skip via localStorage is the only returning-user behavior. No name greeting, no "continue where you left off." |

### Summary Counts

| Class | Count | Elements |
|-------|-------|----------|
| A — Signature | 4 | Unit-9, exam metaphor, admit card, lamp |
| B — Supporting | 7 | Lighting, embers, choice screen, verification, dark scene, boot scanline, security footer |
| C — Redundant | 8 | Aurora blobs, floor grid, card texture, pointer glow, camera spring, eyebrow, progress dots, wave/sparkles |
| D — Distracting | 2 | Social auth buttons, "Back to home" |
| E — Missing | 3 | Constellation fields, passwordless auth, returning-user recognition |

---

## Phase 2 — Visual Hierarchy Problem

### Current Focal Point Map

When the user lands on the login form, these elements compete for attention simultaneously:

1. **Unit-9** — Large SVG with glowing nodes, rotating rings, animated face
2. **Form card** — Glass card with grid texture, serial number header, emerald glow border
3. **Lamp bloom** — Large amber radial gradient (80vh tall)
4. **Ember particles** — Floating dots scattered across the screen
5. **Aurora blobs** — Three large color-shifting blobs (430px, 400px, 340px)
6. **Pointer glow** — Cursor-following radial gradient
7. **Companion message** — Display font text below the avatar
8. **Eyebrow text** — "Exam hall — secure entry" above everything
9. **Form fields** — The actual inputs the user needs to interact with

**The problem:** There are 8+ visual elements competing with the form for attention. The user's eye has no clear path.

### Correct Hierarchy

```
1. FORM (primary)        — where the user acts
2. UNIT-9 (secondary)    — the companion observing
3. LAMP (tertiary)       — the light source creating atmosphere
4. ENVIRONMENT (ambient) — everything else becomes background
```

### What Needs to Change

- **Aurora blobs:** Remove or reduce to 1, much lower opacity
- **Floor grid:** Remove entirely
- **Card texture grid:** Remove from form, keep concept for admit card only
- **Pointer glow:** Reduce intensity or remove
- **Ember count during form interaction:** Reduce by 50%
- **Eyebrow text:** Remove — the form header already says "Exam hall"
- **Progress dots:** Remove — the form content communicates progress
- **Camera spring:** Remove — imperceptible benefit, unnecessary computation
- **Form card glow-border:** The animated gradient border competes with the form itself. Use a static subtle border instead.

---

## Phase 3 — Art Direction

### Recommended Direction: "The Midnight Study"

This is a refinement of the existing system, not a replacement. The central metaphor:

**A student at a desk, late at night, with a lamp, a companion, and an examination form to fill in.**

Everything in the auth environment should feel like it exists in this one coherent world:

- **Lamp** = the light source (the only warm light)
- **Unit-9** = the intelligent study companion (observes, reacts, protects)
- **Form** = the examination document (the thing being filled in)
- **Environment** = the dark room around the desk (quiet, deep, ambient)

### What Changes vs. Current

| Element | Current | Evolved |
|---------|---------|---------|
| Background | Cosmic navy + aurora blobs + floor grid + embers + pointer glow | Cosmic navy + 1 subtle aurora wash + sparse embers |
| Light source | Lamp bloom + pointer glow + aurora blobs | Lamp bloom ONLY — one warm light |
| Form container | Glass card with grid texture + animated glow border | Solid dark surface, static border, no texture |
| Avatar area | Full SVG with rotating rings + nodes + message | Same SVG but quieter during form interaction |
| Typography | Multiple competing text elements | Form title + field labels only |

### The Lighting Model

The room has exactly ONE light source: the lamp.

- **Before lamp on:** Moonlight only (existing cold shaft)
- **After lamp on:** Warm amber bloom radiates from lamp position
- **During form:** Bloom dims slightly to let the form breathe
- **On success:** Bloom intensifies briefly
- **Departure:** Full warm light expansion

No competing light sources. No pointer glow. No aurora blobs fighting for "warmth" attention.

---

## Phase 4 — Form Redesign

### Current Form Architecture

```
┌─────────────────────────────────────┐
│ CardTexture (grid overlay)          │
│ ┌─────────────────────────────────┐ │
│ │ ● Exam hall · entry pass  FORM  │ │
│ │ ─────────────────────────────── │ │
│ │                                 │ │
│ │ [Email field - boxed input]     │ │
│ │ [Password field - boxed input]  │ │
│ │ ☐ Stay signed in   Forgot pass  │ │
│ │ [         Sign in securely    ] │ │
│ │           ← Back                │ │
│ └─────────────────────────────────┘ │
│ glow-border (animated gradient)     │
└─────────────────────────────────────┘
```

**Problem:** The form is a "card placed inside a beautiful background." The grid texture, glow border, and serial number header are decoration ON TOP of the form, not integral to it.

### Proposed Form Architecture

```
┌─────────────────────────────────────┐
│                                     │
│  9TH-GRADE AI                       │
│  ENTRY PASS                         │
│  ─────────────────────────────────  │
│                                     │
│  EMAIL                              │
│  ─────────────────────────────────  │
│                                     │
│  PASSWORD                           │
│  ─────────────────────────────────  │
│                                     │
│  ☐ Stay signed in    Forgot pass?   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      ENTER THE HALL  →      │    │
│  └─────────────────────────────┘    │
│                                     │
│  Form 9G-A1 · Secure session        │
│                                     │
└─────────────────────────────────────┘
```

### Key Changes

1. **Remove card texture grid** — The form surface is clean
2. **Remove animated glow-border** — Use a static 1px border in `border-muted`
3. **Replace boxed inputs with underline fields** — Labels above, thin line below, expands on focus
4. **Keep serial number** — It's part of the exam-hall identity
5. **Remove cardHeader "Exam hall · entry pass"** — The title "ENTRY PASS" already communicates this
6. **Keep shadow-panel** — The existing shadow provides necessary depth
7. **Reduce border-radius** — From `rounded-3xl` (24px) to `rounded-2xl` (16px) — less "bubble," more "document"

### The Underline Field Pattern

Instead of the current `AuthField` (boxed input with left icon), use a cleaner pattern:

```
EMAIL
──────────────────────────
  you@example.com (typed text here)
```

- Label: Fira Code, 10px, uppercase, tracked, emerald-400 when focused
- Underline: 1px, expands from center on focus (0.2s ease-out)
- Default underline: `border-muted`
- Focus underline: `emerald-400/60`
- Error underline: `red-500/60`
- No left icon (the label IS the identifier)
- Password toggle remains as right slot

**Why underline instead of box:** Underline fields feel like filling in a form/document. Boxed fields feel like a software interface. The exam-hall metaphor calls for document-style input.

---

## Phase 5 — Choice Screen Rethink

### Current Choice Screen

```
┌──────────────────────────────────┐
│  [Google button] [Apple button]  │
│  ─── or use exam credentials ──  │
│  ┌────────────────────────────┐  │
│  │ FORM NO. 9G-A1  EXAMINEE  │  │
│  │ Returning candidate        │  │
│  │ I have an account          │  │
│  │ Sign in — your admit card  │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ FORM NO. 9G-B7  NEW ASPIR.│  │
│  │ First attempt              │  │
│  │ I'm new here               │  │
│  │ Form fill-up — issue your  │  │
│  └────────────────────────────┘  │
│  [    Try a demo account    ]    │
└──────────────────────────────────┘
```

**Problem:** This is a menu, not a narrative moment. It asks "which path?" but the paths feel like database options, not meaningful choices.

### Proposed Choice Screen

```
┌──────────────────────────────────┐
│                                  │
│  WELCOME, CANDIDATE              │
│  ──────────────────────────────  │
│                                  │
│  [Google]  [Apple]               │
│                                  │
│  ─── or enter with credentials ──│
│                                  │
│  ┌────────────────────────────┐  │
│  │  →  RETURNING              │  │
│  │     Your preparation is    │  │
│  │     waiting.               │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  ★  FIRST ENTRY            │  │
│  │     Start your preparation.│  │
│  └────────────────────────────┘  │
│                                  │
│  [Explore with demo →]           │
│                                  │
└──────────────────────────────────┘
```

### Key Changes

1. **Title:** "WELCOME, CANDIDATE" instead of no title — establishes the exam-hall context immediately
2. **Option language:** "RETURNING" / "FIRST ENTRY" — shorter, more commanding
3. **Subtitles:** "Your preparation is waiting." / "Start your preparation." — product-relevant, not generic
4. **Remove serial numbers from choice cards** — They add visual noise at this stage. Serial numbers belong on the FORM, not the choice.
5. **Remove tags (EXAMINEE, NEW ASPIRANT)** — Redundant with the titles
6. **Remove Interactive3DCard** — The tilt effect is delightful but adds computation and visual noise to a decision point
7. **Social auth:** Keep above the divider, styled consistently
8. **Demo button:** Change to ghost link style — "Explore with demo →"

---

## Phase 6 — Unit-9 Redesign

### Current Unit-9 Behavior Audit

| Reaction | Meaningful? | Notes |
|----------|-------------|-------|
| Boot scanline sweep | Yes | One-time power-on establishes identity |
| Natural blinking | Yes | Makes the companion feel alive |
| Pointer gaze tracking | Yes | Creates connection between user and companion |
| Keystroke head nod | Marginal | Nodding on EVERY keystroke is too frequent. Feels mechanical. |
| Keystroke ripple ring | No | Adds visual noise during the most important action (typing) |
| Keystroke node pulse | No | Same — too much reaction to routine input |
| Privacy mode (password focus) | Yes | The amber indicator communicates trust |
| Loading equalizer mouth | Yes | Clear communication of processing |
| Error shudder | Yes | Immediate feedback that something went wrong |
| Success wave hand | Marginal | Slightly cartoonish for the serious context |
| Success sparkles | No | Adds visual noise during the admit card ceremony |
| Success light sweep | Yes | Subtle, elegant confirmation |
| Breath animation (ultra only) | Yes | Makes the companion feel physical |
| Focus lean toward fields | Yes | Shows attentiveness without being distracting |

### Recommendations

**Keep:**
- Boot scanline (one-time)
- Natural blinking
- Pointer gaze tracking
- Privacy mode indicator
- Loading equalizer
- Error shudder
- Success light sweep
- Focus lean
- Breath animation

**Reduce:**
- Keystroke head nod → only on password field (privacy focus), not every field

**Remove:**
- Keystroke ripple ring — too much visual noise
- Keystroke node pulse — too much visual noise
- Success wave hand — replace with a subtle head tilt + happy expression
- Success sparkles — the admit card is the celebration, not the avatar

**The principle:** Unit-9 should react to **meaningful state changes** (focus, privacy, error, success), not to **routine actions** (every keystroke).

---

## Phase 7 — Quiet Mode

### The Focus Choreography

The environment should progressively quiet down as the user engages with the form:

```
CHOICE STAGE
  Environment: Full ambiance (lamp bloom, embers, aurora)
  Unit-9: Observing, message displayed
  Form: Not yet visible

FORM STAGE (no field focused)
  Environment: Aurora blobs fade out (opacity 0)
  Embers: Reduce to 40% of choice count
  Lamp bloom: Slight dim
  Unit-9: Attentive, ready
  Form: Dominant

FIELD FOCUSED
  Environment: Embers reduce to 20%
  Lamp bloom: Further dim
  Unit-9: Leans toward focused field, goes quiet (no message)
  Form: Fully dominant

PASSWORD FOCUSED
  Environment: Embers at minimum
  Unit-9: Privacy mode (looks away)
  Form: Fully dominant

SUBMITTING
  Environment: Embers off
  Unit-9: Processing expression
  Form: Button shows loading

SUCCESS
  Environment: Full ambiance returns (lamp bloom intensifies)
  Unit-9: Celebrating
  Admit card: The star
```

**The principle:** The environment supports the task. When the task demands focus, the environment recedes. When the task completes, the environment celebrates.

### Implementation

Modify `AuthEnvironment.tsx` to accept a `quietLevel` prop (0-3) that controls:
- Aurora blob opacity
- Ember count multiplier
- Lamp bloom intensity
- Pointer glow presence

The `AuthExperience.tsx` derives `quietLevel` from the current stage + focus state.

---

## Phase 8 — Focus Zone

When a field is focused:

1. **Form card:** Remove `glow-border` animation. Use static border.
2. **Surrounding fields:** Slight opacity reduction (0.7) to emphasize the active field
3. **Field underline:** Expands from center with emerald glow
4. **Unit-9:** Leans toward the field, expression becomes attentive
5. **Background:** Subtle darkening around the form (vignette intensifies slightly)
6. **No zoom/scale:** The form does not move or scale. The environment shifts around it.

**The principle:** Focus is communicated through LIGHT and ATTENTION, not through MOTION and SCALE.

---

## Phase 9 — Color System Rework

### Current Palette Usage

The current system uses 5 accent colors simultaneously:
- Emerald (#2dd4bf) — primary signal
- Cyan (#22d3ee) — secondary, embers, some accents
- Indigo (#818cf8) — moonlight, aurora
- Amber (#fbbf24) — lamp bloom, privacy indicator
- Rose (#fb7185) — error states

### Problem

All 5 colors appear in the environment at the same time. The aurora blobs cycle through emerald, indigo, and cyan. The embers alternate between cyan and emerald. The result is a "rainbow ambient" that dilutes brand identity.

### Proposed Color Hierarchy

```
DOMINANT:  Emerald (#2dd4bf) — the brand color, appears everywhere
SECONDARY: Amber (#fbbf24) — warm light, the lamp, privacy
ACCENT:    Cyan (#22d3ee) — sparingly, only for emphasis
NEUTRAL:   Indigo (#818cf8) — ONLY in the moonlight shaft (before lamp)
ERROR:     Rose (#fb7185) — only in error states
```

### Changes

1. **Aurora blobs:** Remove indigo and cyan blobs. Keep only 1 emerald blob at very low opacity.
2. **Ember colors:** Make all embers emerald (#34d399). Remove cyan alternation.
3. **Moonlight:** Keep indigo — it's the pre-lamp cold light, thematically correct.
4. **Focus states:** Emerald only. No cyan or indigo in focus rings.
5. **Success states:** Emerald + amber (warmth). No cyan.
6. **Error states:** Rose. No other color competition.

**Result:** The environment reads as "emerald brand + amber warmth" instead of "rainbow aurora."

---

## Phase 10 — Material Language

### Current Materials

| Material | Usage | Assessment |
|----------|-------|------------|
| `glass-card` | Form container | Solid surface, no blur. Good. |
| `glow-border` | Form card border | Animated gradient pan. Too active. |
| `surface-raised` | Buttons, cards | Good — elevated dark surface |
| `surface-muted` | Secondary surfaces | Good |
| `border-muted` | Default borders | Good |
| CSS grid texture | Card interior | Remove — adds noise |
| CSS paper grain | Admit card | Keep — adds document feel |

### Proposed Material Vocabulary

**Primary surface:** `surface-raised` with static `border-muted` border. No texture. No animated border. Clean, matte, dark.

**Document surface (admit card):** Paper grain texture + dashed borders + perforation. This is the only surface that gets texture — it's the "official document."

**Light source:** The lamp bloom is the only warm element. No competing light sources.

**Shadow language:** Keep existing `shadow-panel` and `shadow-elevation-1`. These provide depth without visual noise.

### What NOT to Add

- No frosted glass / backdrop-blur on new elements
- No new texture patterns
- No new gradient borders
- No new glow effects

---

## Phase 11 — Typographic Art Direction

### Current Typography Hierarchy

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Brand name | Space Grotesk | 15px | 600 |
| Lamp scene headline | Space Grotesk | 20-24px | 400 |
| Companion message | Space Grotesk | 18-22px | 500 |
| Form card header | Fira Code | 10px | 400 |
| Field labels | Fira Code | 10px | 400 |
| Field values | Inter | 16px | 400 |
| Button text | Inter | 15px | 600 |
| Serial numbers | Fira Code | 9-10px | 400 |
| Eyebrow text | Fira Code | 11px | 400 |
| Security footer | Inter | 12px | 400 |

### Proposed Hierarchy (Simplified)

| Element | Font | Size | Weight | Change |
|---------|------|------|--------|--------|
| Brand name | Space Grotesk | 15px | 600 | Same |
| Form title | Space Grotesk | 28px | 700 | NEW — large, commanding |
| Form subtitle | Fira Code | 10px | 400 | Same |
| Field labels | Fira Code | 10px | 500 | Same |
| Field values | Inter | 16px | 400 | Same |
| Button text | Inter | 15px | 600 | Same |
| Serial number | Fira Code | 9px | 400 | Same |
| Security footer | Inter | 11px | 400 | Slightly smaller |

### What Changes

1. **Add a form title:** "ENTRY PASS" in Space Grotesk, 28px, 700 weight. This replaces the tiny "Exam hall · entry pass" mono label.
2. **Remove eyebrow text:** "Exam hall — secure entry" above the form area. The form title handles this.
3. **Remove companion message from form stage:** During login/signup, the companion goes quiet. No competing text.
4. **Remove progress dots:** The form title + serial number communicate context.

---

## Phase 12 — Micro-Interactions (Refined)

### Lamp

**Current:** Click to activate, cord pulls, light cone expands, 720ms wait, then choice stage.
**Refined:** Same, but the "Turn on the light" button should feel more tactile — increase the spring stiffness on hover. The lamp cord pull is excellent and should remain.

### Choice

**Current:** Cards with 3D tilt, texture, serial numbers, tags.
**Refined:** Flat cards, clean text, no 3D tilt. The choice should feel like a clear decision, not an interactive demo.

### Input Focus

**Current:** Boxed input with emerald border + focus ring.
**Refined:** Underline expands from center. Label turns emerald. No box, no focus ring (the underline IS the focus indicator).

### Typing

**Current:** Avatar nods on every keystroke + ripple ring + node pulse.
**Refined:** Avatar remains still during typing. Only reacts on password focus (privacy) and error/success states.

### Password

**Current:** Privacy mode with amber indicator + avatar looks away.
**Refined:** Same — this is excellent. Keep exactly as-is.

### Validation

**Current:** Field error with red text below.
**Refined:** Same, plus the underline turns red. No shake animation on individual field errors (only on form-level submit error).

### Error

**Current:** Red alert banner + form shake + avatar frown.
**Refined:** Same, but the shake should be more subtle (reduce amplitude from ±8 to ±4). The error banner should use the exam-hall metaphor: "Record not found in the register" instead of generic "Something went wrong."

### Submit

**Current:** Loading spinner + "Signing in..."
**Refined:** Same — this is clean and effective.

### Verification

**Current:** 3-step checklist running for ~1.3s on every auth.
**Refined:** Skip on login (go straight to admit card). Keep on signup only (where it adds ceremonial weight).

### Success

**Current:** Admit card + "Welcome back" text + "Enter the hall" button + auto-redirect after 2.6s.
**Refined:** Same but remove the companion sparkles and wave. The admit card IS the celebration.

### Transition

**Current:** "Entering the hall" warm light expansion.
**Refined:** Same — this is excellent.

---

## Phase 13 — Success Experience

### Current Admit Card Audit

The admit card contains:
- BrandMark + "9th-Grade AI · Admit Card"
- Serial number (deterministic from email)
- ScanLine icon
- Candidate name
- Seat number, Issued date, Status
- Perforation strip
- "New Aspirant" / "Returning Examinee"
- "Session valid · 7 days"
- "Candidate verified · Registrar: Unit-9"
- Barcode (16 bars)
- "✓ Authenticated" stamp

**Assessment:** This is a visual ceremony. It's beautiful and product-specific. But it doesn't tell the user what to do next.

### Proposed Improvement

Keep the admit card exactly as-is. It's the signature moment. But below it, change the CTA from:

```
"Enter the hall →"
```

To:

```
"Enter the hall →"
"The hall kept your place — let's keep going."
```

This already exists. The admit card is fine. The issue is that the auto-redirect fires after 2.6s, which may be too fast for users to read the card. Consider extending to 3.5s or removing auto-redirect entirely (let the user click "Enter the hall").

---

## Phase 14 — Mobile-First Reconstruction

### Current Mobile Behavior

- `< 380px`: Avatar hidden entirely
- `< 768px`: Avatar stacks above content (vertical flow)
- `≥ 768px`: Avatar left, form right (split layout)
- Form: `max-w-md` with internal scroll
- Header: Logo + "Back to home"
- Footer: Security text

### Problems

1. **Avatar hidden on small phones:** The most proprietary element disappears on the most common device.
2. **Lamp scene on mobile:** Full copy + lamp + button = too much vertical content before the form.
3. **Form scroll:** The form scrolls internally within `overflow-y-auto`, which can feel cramped.
4. **"Back to home" on mobile:** Takes header space from the logo.

### Proposed Mobile Layout

```
┌───────────────────────┐
│ [Logo] 9Th-Grade AI   │
│                       │
│  ENTRY PASS           │
│  ───────────────────  │
│                       │
│  EMAIL                │
│  ───────────────────  │
│                       │
│  PASSWORD             │
│  ───────────────────  │
│                       │
│  ☐ Stay signed in     │
│     Forgot password?  │
│                       │
│  ┌─────────────────┐  │
│  │ ENTER THE HALL →│  │
│  └─────────────────┘  │
│                       │
│  Form 9G-A1           │
│                       │
│  🔒 Secure session    │
└───────────────────────┘
```

### Key Changes

1. **No avatar on mobile** — The form IS the experience on small screens. The avatar can be a small 32px icon in the header for brand recognition.
2. **No lamp scene on mobile** — Auto-activate. The lamp metaphor works on desktop where there's space for the reveal. On mobile, go straight to the form.
3. **No "Back to home" on mobile** — The logo is sufficient navigation.
4. **Full-height form** — The form fills the screen without internal scroll. Use `min-h-dvh` and let the form fields + button + footer fill naturally.
5. **Social auth below the form** — On mobile, social auth moves to the bottom (below the submit button) as a secondary option.

---

## Phase 15 — Performance Refinement

### Current Performance Risks

| Element | Risk | Mitigation |
|---------|------|------------|
| **Pointer glow** | `requestAnimationFrame` on every mouse move. Creates compositor layer. | Already gated by `pointerEffects`. Consider removing entirely. |
| **Camera spring** | Framer Motion spring on every scene change. | Remove — the 2.5% max movement is imperceptible. |
| **Avatar gaze tracking** | `useSpring` + `useTransform` per render. | Keep — it's the signature interaction. Already GPU-composited. |
| **Keystroke ripple** | SVG circle animation per keystroke. | Remove — too frequent, adds paint overhead. |
| **Keystroke head nod** | `useAnimationControls.start()` per keystroke. | Reduce to password-only. |
| **Ember animations** | CSS `float-up` keyframes on up to 20 elements. | Keep but reduce max count from 20 to 12. |
| **Aurora blob blur** | `filter: blur(72px)` on 3 elements. | Remove blobs or reduce to 1. blur(72px) is expensive on mobile. |
| **glow-border animation** | `background-position` animation on form card. | Replace with static border. |
| **SVG complexity** | Avatar SVG has ~40 elements. | Keep — SVG is lightweight and resolution-independent. |
| **Framer Motion bundle** | Already lazy-loaded for toaster. Auth uses it directly. | Accept — Framer Motion is needed for the avatar and transitions. |

### Target Improvements

- Remove pointer glow (~2KB saved, removes rAF loop)
- Remove camera spring (removes Framer Motion spring computation)
- Remove aurora blobs (removes 3 × `filter: blur(72px)` compositor layers)
- Remove glow-border animation (removes continuous CSS animation)
- Remove keystroke ripple (removes SVG animation per keystroke)
- Reduce ember max count from 20 to 12

**Estimated impact:** ~15-20% reduction in GPU composition work during form interaction.

---

## Phase 16 — Quality Tier Reassessment

### Current Tiers

| Tier | Embers | Pointer Gaze | Camera | Aurora Blobs | Breath |
|------|--------|-------------|--------|-------------|--------|
| ultra | 20 | Yes | Yes | Animated | Yes |
| high | 16 | Yes | Yes | Animated | No |
| medium | 10 | No | Yes | Animated | No |
| low | 6 | No | No | Static | No |
| reduced | 0 | No | No | None | No |

### Proposed Tiers (After Subtraction)

| Tier | Embers | Pointer Gaze | Aurora | Form Border |
|------|--------|-------------|--------|-------------|
| ultra | 12 | Yes | 1 blob, animated | Static |
| high | 8 | Yes | 1 blob, animated | Static |
| medium | 6 | No | 1 blob, static | Static |
| low | 3 | No | None | Static |
| reduced | 0 | No | None | Static |

**Key change:** Aurora blobs reduced from 3 to 1 (or 0 on low). Form border is always static (no animated gradient).

---

## Phase 17 — Accessibility

### Current Accessibility Scorecard

| Criterion | Status | Notes |
|-----------|--------|-------|
| Keyboard navigation | ✅ Good | Tab order is logical. Enter submits. |
| Focus indicators | ✅ Good | `focus-visible:ring-2` on all interactive elements. |
| Semantic labels | ✅ Good | All fields have visible labels. |
| aria-live | ✅ Good | Companion message and errors use `aria-live`. |
| Error focus | ✅ Good | Errors receive focus via `document.getElementById`. |
| Reduced motion | ✅ Good | Comprehensive `prefers-reduced-motion` support. |
| Contrast | ⚠️ Needs audit | Some emerald-400/80 text may fail WCAG AA on dark backgrounds. |
| Screen reader | ✅ Good | Avatar has `role="img"` and `aria-label`. Decorative elements have `aria-hidden`. |
| Touch targets | ✅ Good | All targets exceed 44×44px. |
| Autofill | ✅ Good | `autoComplete` attributes set correctly. |
| Password managers | ✅ Good | Standard `<input>` elements, no paste blocking. |
| Paste support | ✅ Good | No paste blocking (WCAG 3.3.8 compliant). |

### Improvements Needed

1. **Contrast audit:** Check emerald-400/80 on `#04060f` background. May need to increase to emerald-400/90 or use solid emerald-400.
2. **Form title heading level:** "ENTRY PASS" should be an `<h2>` for screen reader navigation.
3. **Social auth buttons:** Add `aria-label` with full context ("Sign in with Google").

---

## Phase 18 — Competitive Research (Extracted Principles)

### From Premium Auth Systems

- **Linear:** Speed of completion. Don't add ceremony where speed matters.
- **Stripe:** Editorial typography creates hierarchy without decoration.
- **Notion:** Context preview behind auth creates motivation.

### From Financial/Security Products

- **1Password:** Privacy mode is a feature, not just a visual trick.
- **Hardware tokens:** The "verification ceremony" feels meaningful because it's brief.

### From Education Platforms

- **Duolingo:** The companion character creates emotional connection.
- **Khan Academy:** Clean forms with clear progress indicators.

### From Cinematic Web Experiences

- **Apple:** Subtle camera movements create depth without distraction.
- **Stripe Press:** Typography IS the visual design.

### What 9Th-Grade AI Can Uniquely Own

1. **The lamp** — No other product uses a desk lamp as an auth entry point
2. **The exam-hall metaphor** — Culturally specific, emotionally resonant
3. **Unit-9** — A companion that watches you study, not just a mascot
4. **The admit card** — Authentication success feels like an achievement

---

## Phase 19 — Five Evolution Directions

### Direction A: "Refined Cinematic"

**Concept:** Keep the existing world. Dramatically improve hierarchy through subtraction. Remove aurora blobs, floor grid, card texture, pointer glow, camera spring. Quiet the environment during form interaction. Make Unit-9 less reactive to keystrokes.

**Composition:** Same split layout (avatar left, form right). Cleaner form surface. Fewer competing elements.

**Art system:** Same — lamp, Unit-9, cosmic background. Just less of it.

**Form design:** Same boxed inputs but with static border (no glow-border animation). Cleaner surface.

**Unit-9 role:** Same companion, fewer reactions. Attentive observer, not reactive performer.

**Environment:** Lamp bloom + sparse embers + 1 aurora blob. No floor grid. No pointer glow.

**Typography:** Same hierarchy. Add form title "ENTRY PASS."

**Motion:** Remove camera spring, keystroke ripple, keystroke node pulse. Keep blink, gaze, privacy, loading, error, success.

**Mobile:** Same layout. Remove lamp scene. No avatar on small screens.

**Performance:** ~15% GPU improvement from removing aurora blobs + pointer glow + camera spring.

**Accessibility:** Same high standard. Add contrast fixes.

**Complexity:** Low — mostly removal + minor CSS changes.

**Risks:** May feel too similar to current. Not distinctive enough.

**Strengths:** Safe, incremental, preserves all investment.

---

### Direction B: "Intelligent Terminal"

**Concept:** Unit-9 becomes the central element. The form is a credential terminal integrated into Unit-9's world. The constellation nodes become active elements. The experience feels like accessing an intelligent system.

**Composition:** Unit-9 centered, larger. Form fields below as terminal-style inputs. Constellation nodes in background.

**Art system:** Terminal geometry. Knowledge nodes. System status indicators. Diagnostic UI.

**Form design:** Monospace labels. Underline inputs. Terminal-style prompt indicators.

**Unit-9 role:** Central. The form exists within Unit-9's domain.

**Environment:** Dark terminal aesthetic. System status lights. Node network.

**Typography:** Monospace-dominant. System status labels. Diagnostic readouts.

**Motion:** Node activation on field interaction. System boot on page load.

**Mobile:** Unit-9 smaller, form fills screen. Terminal aesthetic maintained.

**Performance:** Moderate — SVG node network needs careful implementation.

**Accessibility:** Challenging — terminal aesthetics can reduce readability.

**Complexity:** High — significant visual redesign.

**Risks:** May feel too "hacker" or intimidating for the audience.

**Strengths:** Most distinctive. Strongest brand identity.

---

### Direction C: "Midnight Study"

**Concept:** The desk lamp is the primary identity. The entire environment is a study desk at night. Unit-9 sits on the desk. The form is a paper on the desk. The lamp illuminates the form.

**Composition:** Lamp at top, form below in the light cone. Unit-9 to the side.

**Art system:** Desk surface. Lamp with light cone. Paper/document form. Ambient darkness.

**Form design:** Document-style. Underline fields. Paper texture. Official header.

**Unit-9 role:** Sitting on the desk. Observing. Less prominent than the lamp.

**Environment:** Dark room with single warm light source. Minimal ambient effects.

**Typography:** Document-style. Official. Monospace for labels.

**Motion:** Lamp breathe. Dust motes in light cone. Minimal other animation.

**Mobile:** Lamp as small icon. Form fills screen. Document aesthetic maintained.

**Performance:** Excellent — CSS-only environment, minimal animation.

**Accessibility:** Excellent — document structure is inherently accessible.

**Complexity:** Medium — new composition, reuses existing components.

**Risks:** May feel too warm/cozy for a serious exam prep product.

**Strengths:** Coherent world. Single light source. Clear hierarchy.

---

### Direction D: "Exam Threshold"

**Concept:** The entire auth journey is the threshold between "outside" and "inside" the exam hall. Each stage is a step closer to entry. The environment transforms from cold (outside) to warm (inside).

**Composition:** Progressive transformation. Left side = outside (cold, dark). Right side = inside (warm, lit). The form straddles the boundary.

**Art system:** Threshold visualization. Progressive warmth. Gate/doorway metaphor.

**Form design:** The form IS the gate. Completing it opens the passage.

**Unit-9 role:** The gatekeeper. Verifies credentials. Opens the door.

**Environment:** Split — cold outside, warm inside. Boundary dissolves as auth completes.

**Typography:** Command-style. Authoritative. "IDENTIFY YOURSELF" / "CREDENTIALS VERIFIED."

**Motion:** Progressive warmth expansion. Gate opening on success.

**Mobile:** Vertical threshold (top = outside, bottom = inside).

**Performance:** Moderate — gradient transitions need careful implementation.

**Accessibility:** Good — form remains standard. Split is visual only.

**Complexity:** High — new visual concept, significant implementation.

**Risks:** May feel too dramatic. The threshold metaphor may not be clear.

**Strengths:** Narratively powerful. Clear progression.

---

### Direction E: "Signature Hybrid"

**Concept:** Combine the strongest existing elements with targeted improvements. Keep the lamp. Keep Unit-9. Keep the admit card. Fix the hierarchy. Remove the noise. Add the document-style form.

**Composition:** Same split layout. Cleaner. Fewer competing elements.

**Art system:** Lamp + Unit-9 + cosmic background. No aurora blobs. No floor grid. No pointer glow.

**Form design:** Document-style container with underline fields. Static border. Serial number header.

**Unit-9 role:** Refined companion — fewer reactions, more meaningful responses.

**Environment:** Lamp bloom + sparse embers. One aurora blob at most.

**Typography:** Add "ENTRY PASS" title. Remove eyebrow text and progress dots.

**Motion:** Remove camera spring, keystroke ripple, keystroke node pulse. Keep everything else.

**Mobile:** Auto-activate lamp. Form fills screen. Small Unit-9 icon in header.

**Performance:** ~20% GPU improvement from targeted removals.

**Accessibility:** Same standard + contrast fixes + heading hierarchy.

**Complexity:** Low-Medium — evolutionary changes to existing system.

**Risks:** May not feel "new enough" for a major version bump.

**Strengths:** Preserves all investment. Safe. Maintainable. Performant.

---

## Phase 20 — Scorecard

| Criterion | A: Refined | B: Terminal | C: Study | D: Threshold | E: Hybrid |
|-----------|-----------|------------|---------|-------------|----------|
| Brand identity | 8 | 9 | 8 | 7 | 8 |
| Originality | 6 | 9 | 7 | 8 | 7 |
| Emotional impact | 7 | 7 | 8 | 9 | 8 |
| Visual sophistication | 8 | 8 | 7 | 8 | 8 |
| Form usability | 9 | 7 | 8 | 7 | 9 |
| Product relevance | 8 | 7 | 8 | 7 | 9 |
| Memorability | 7 | 9 | 7 | 8 | 8 |
| Mobile UX | 8 | 6 | 8 | 6 | 8 |
| Accessibility | 9 | 6 | 9 | 7 | 9 |
| Performance | 9 | 7 | 9 | 7 | 9 |
| Technical feasibility | 9 | 5 | 7 | 5 | 9 |
| Maintainability | 9 | 6 | 8 | 6 | 9 |
| **TOTAL** | **97** | **90** | **94** | **87** | **103** |

### Winner: Direction E — Signature Hybrid (103/120)

**Why:** It achieves the highest total by scoring consistently high across all dimensions. It doesn't excel in any single area but avoids weaknesses. It preserves all existing investment while making targeted improvements. It's the most feasible, maintainable, and performant option.

### Runner-up: Direction A — Refined Cinematic (97/120)

Very close. The difference is that Direction E adds the document-style form and refined copy, which Direction A doesn't.

---

## Phase 21 — Signature Moment

### The Signature Moment: "The Admit Card Stamp"

After testing all possibilities, the signature moment is the **admit card stamp** — that instant when the "✓ Authenticated" stamp springs into place with the satisfying scale animation.

This is the moment that:
- Transforms authentication from a chore into an achievement
- Is unique to 9Th-Grade AI (no other product does this)
- Is culturally resonant (every Bangladeshi aspirant knows the admit card)
- Creates a memory ("I got my admit card")
- Provides emotional closure to the auth journey

### How to Make It Exceptional

1. **Don't auto-redirect.** Let the user see the admit card for at least 3 seconds. Remove auto-redirect entirely — only the "Enter the hall" button navigates.
2. **Make the stamp more satisfying.** Increase the spring stiffness from 420 to 500 for a snappier pop.
3. **Add a subtle sound.** Not required, but a soft "stamp" sound effect on the stamp appearing would be memorable. (Audio is out of scope for this research.)
4. **The rest of the interface supports it.** During success, the environment brightens, Unit-9 celebrates, embers increase. But the admit card is the visual focus.

---

## Phase 22 — Remove 20% of the Current Design

### Elements to Remove

| Element | Lines Saved | Reason |
|---------|-------------|--------|
| **Aurora blobs (3)** | ~30 lines in AuthEnvironment.tsx | Compete with lamp bloom for warm light. Remove all 3. |
| **Floor grid** | ~12 lines in AuthEnvironment.tsx | Rarely visible. Adds nothing. |
| **Pointer glow** | ~20 lines in AuthEnvironment.tsx + CSS | Removes rAF loop. Imperceptible benefit. |
| **Camera spring** | ~10 lines in AuthExperience.tsx | 2.5% movement is imperceptible. Removes Framer Motion spring. |
| **Card texture grid** | ~12 lines in AuthExperience.tsx | Adds visual noise to form surface. |
| **Keystroke ripple ring** | ~12 lines in Avatar.tsx | Too frequent. Adds paint overhead. |
| **Keystroke node pulse** | Effect removed from Avatar.tsx | Too frequent. |
| **Success wave hand** | ~10 lines in Avatar.tsx | Slightly cartoonish. Replace with head tilt. |
| **Success sparkles** | ~8 lines in Avatar.tsx | Admit card is the celebration. |
| **Eyebrow text** | ~8 lines in AuthExperience.tsx | Redundant with form title. |
| **Progress dots** | ~25 lines in AuthExperience.tsx | Redundant with form content. |
| **"Back to home" link** | ~5 lines in AuthExperience.tsx | Redundant with logo. |

**Total removed:** ~152 lines of code + ~3 CSS animations + 3 aurora blob DOM elements + 1 rAF loop + 1 Framer Motion spring.

**Result:** The interface becomes quieter, more focused, and more performant. The remaining elements (lamp, Unit-9, form, admit card) have more visual space to breathe.

---

## Phase 23 — Design Rules

### DO

1. **One light source.** The lamp is the only warm light. Everything else is ambient darkness.
2. **Form is primary.** Every other element supports the form's readability and completion.
3. **Unit-9 observes, not performs.** React to state changes, not routine actions.
4. **Document aesthetic.** The form feels like filling in an official examination document.
5. **Emotional restraint.** Dramatic moments (lamp on, admit card) are earned by quiet preceding them.
6. **Emerald is the brand.** All accent colors support emerald. No competing rainbow.
7. **Subtraction over addition.** Remove before adding. Every element must justify its presence.
8. **Mobile-first composition.** Design for 375px, then enhance for larger screens.
9. **Accessibility is non-negotiable.** The art layer sits around a fundamentally excellent form.
10. **Performance is design.** Smooth 60fps on mid-tier devices is a requirement, not a bonus.

### DON'T

1. **No aurora blobs.** They compete with the lamp for warmth attention.
2. **No animated borders.** The `glow-border` gradient pan is too active for a form.
3. **No keystroke reactions.** Unit-9 does not nod/ripple on every keypress.
4. ** no particles during form interaction.** Embers reduce when the form is active.
5. **No competing light sources.** No pointer glow, no aurora wash competing with lamp.
6. **No generic SaaS patterns.** Social auth buttons must match the exam-hall language.
7. **No unnecessary ceremony.** Verification only on signup. Login goes straight to admit card.
8. **No visual noise.** Every pixel must justify its presence. If it doesn't help the user authenticate, remove it.
9. **No template aesthetics.** This is not a login page. It's an entry experience.
10. **No decoration for decoration's sake.** Every animation, texture, and effect must have a product reason.

---

## Phase 24 — Final Recommendation

### "This is how I would evolve 9Th-Grade AI authentication if this were my product."

#### The Environment

A dark cosmic room. One warm light source: the desk lamp. Sparse embers drift upward. The background is deep navy (#04060f) with a single emerald aurora wash at very low opacity. No floor grid. No competing light sources. The environment breathes quietly and recedes when the form demands focus.

#### The Art

SVG-based. The lamp is the primary illustration. Unit-9 is the companion illustration. The admit card is the success illustration. No new artwork required. Remove aurora blobs, floor grid, and card texture. The art system is: lamp + Unit-9 + document surfaces.

#### The Form

A clean dark surface with a static 1px border. Title: "ENTRY PASS" in Space Grotesk, 28px, bold. Subtitle: serial number in Fira Code, 10px. Fields are underline-style: label above in Fira Code, thin line below, text in Inter. No boxed inputs. No grid texture. No animated border. The form feels like filling in an official examination document.

#### Unit-9

The same SVG companion with refined behavior. Boot scanline on first load. Natural blinking. Pointer gaze tracking. Privacy mode on password focus. Loading equalizer. Error shudder. Success light sweep + head tilt (no wave, no sparkles). Attentive observer, not reactive performer. Quieter during form interaction.

#### Typography

Three levels: Display (Space Grotesk for titles), Body (Inter for form values and buttons), Mono (Fira Code for labels, serial numbers, status). No new fonts. Simplified hierarchy — form title is the largest element.

#### Colors

Emerald dominates. Amber supports (lamp warmth, privacy indicator). Cyan accents sparingly. Indigo only in moonlight. Rose only in errors. No rainbow ambient.

#### Materials

Matte dark surface (no glass, no blur, no animated borders). Document paper grain (admit card only). The lamp bloom is the only warm material.

#### Motion

CSS for ambient loops (embers, blink, breathing). Framer Motion for state transitions (entrance, exit, expressions). Remove: camera spring, keystroke ripple, keystroke node pulse, aurora drift, glow-border pan. Keep: lamp activation, form entrance, admit card entrance, verification sequence, departure transition.

#### Interactions

Lamp: tactile pull-cord. Choice: clear decision, no 3D tilt. Fields: underline expansion on focus. Typing: quiet — no avatar reaction. Password: privacy mode activates. Submit: loading spinner. Verification: checklist (signup only). Success: admit card stamp. Departure: warm light expansion.

#### Mobile

Auto-activate lamp. Form fills screen. No avatar (small icon in header). Social auth below submit. Document aesthetic maintained. No ambient effects on low-end devices.

#### Accessibility

All existing features preserved. Add: contrast fixes for emerald text, heading hierarchy for form title, aria-label for social auth. WCAG 2.2 AA compliance maintained.

#### Performance

~20% GPU improvement from removing aurora blobs, pointer glow, camera spring, keystroke animations. Target: < 100ms INP, 0 CLS, < 1.5s LCP.

#### Authentication Journey

1. **Page load:** Dark room. Lamp unlit. If returning user, auto-activate.
2. **Lamp on:** Warm light expands. Choice stage appears.
3. **Choice:** "Welcome, candidate." Two clear paths. Social auth above.
4. **Form:** "ENTRY PASS." Clean document. Underline fields. Unit-9 observes.
5. **Focus:** Environment quiets. Unit-9 leans in. Form dominates.
6. **Password:** Privacy mode. Unit-9 looks away. Amber indicator.
7. **Submit:** Loading. Unit-9 processes.
8. **Verification (signup only):** Checklist. Unit-9 confirms.
9. **Success:** Admit card materializes. Stamp springs in. Environment brightens.
10. **Departure:** "Enter the hall." Warm light expansion. Dashboard arrives.

#### Signature Moment

The admit card stamp. That instant when "✓ Authenticated" springs into place. This is the moment that transforms authentication from a chore into an achievement. Everything else supports reaching this moment.

---

## AUTH 2.0 IMPLEMENTATION BLUEPRINT

### 1. Components to Keep (No Changes)

- `LoginEntry.tsx` — Search param reader
- `auth-state.ts` — State machine (15 avatar states, expressions)
- `AnimationDirector.ts` — Scene resolver
- `AuthField.tsx` — Field primitive (will be used in new form)
- `AuthSubmitButton.tsx` — Submit CTA
- `AuthMessage.tsx` — Animated message
- `AuthShell.tsx` — Secondary route frame
- `CapsLockWarning.tsx` — Advisory
- `Celebration.tsx` — Particle burst
- `Unit9Face.tsx` — LED face hardware
- `EnterHallTransition.tsx` — Departure transition

### 2. Components to Modify

| Component | Changes |
|-----------|---------|
| `AuthExperience.tsx` | Remove: camera spring, eyebrow text, progress dots, "Back to home" link, card texture grid, glow-border class. Add: form title "ENTRY PASS", quietLevel derivation, document-style form container. Modify: choice stage copy, success stage (remove auto-redirect, extend to 3.5s). |
| `AuthEnvironment.tsx` | Remove: aurora blobs (3), floor grid, pointer glow + rAF loop. Add: quietLevel prop controlling ember count and bloom intensity. Simplify: SCENE values (remove moonlight after lamp-on). |
| `Avatar.tsx` | Remove: keystroke ripple ring, keystroke node pulse, success wave hand, success sparkles. Reduce: keystroke head nod to password-only. Modify: success behavior to head tilt only. |
| `AuthChoice.tsx` | Remove: Interactive3DCard wrapper, serial numbers from cards, EXAMINEE/NEW ASPIRANT tags. Modify: copy to "RETURNING" / "FIRST ENTRY" with product-relevant subtitles. Add: "WELCOME, CANDIDATE" title. |
| `LoginForm.tsx` | Modify: Use underline field style (remove left icon, add underline animation). Remove: "Back" button (use browser back or logo). |
| `SignupForm.tsx` | Same as LoginForm. |
| `VerificationSequence.tsx` | Add: skip-on-login logic (only run for signup). |
| `AdmitCard.tsx` | No changes — keep exactly as-is. |

### 3. Components to Merge

None. The current component boundaries are clean.

### 4. Components to Remove

None. All components are either kept or modified. The ConstellationField/ConstellationForm remain unused (dead code) — they could be removed in a separate cleanup PR.

### 5. New Components Required

| Component | Purpose | Lines (est.) |
|-----------|---------|-------------|
| `UnderlineField.tsx` | New field primitive with underline animation | ~100 |

This replaces `AuthField.tsx` for the auth forms. The existing `AuthField.tsx` is kept for other uses (settings, etc.).

### 6. State-Machine Changes

None. The existing `auth-state.ts` state machine covers all scenarios. The `AnimationDirector.ts` scene resolver is unchanged.

### 7. Visual-Token Changes

| Token | Change |
|-------|--------|
| `--border-muted` | Keep as-is |
| `--surface-raised` | Keep as-is |
| Form border | Change from `glow-border` (animated) to static `border-muted` |
| Ember colors | Change from emerald/cyan alternation to emerald-only |
| Aurora blobs | Remove from DOM |

### 8. Animation Changes

| Animation | Action |
|-----------|--------|
| `aurora-drift` | Remove from auth (keep in globals.css for landing page) |
| `shine-sweep` | Keep on submit button |
| `avatar-blink` | Keep |
| `avatar-face-fade` | Keep |
| `avatar-sparkle` | Remove from auth (keep in globals.css for landing page) |
| `hud-ring` | Keep (slower rotation) |
| `float-up` (embers) | Keep, reduce max count |
| Camera spring | Remove |
| Keystroke ripple | Remove |
| Keystroke node pulse | Remove |
| Success wave | Remove |
| Glow-border pan | Remove from auth form |

### 9. Responsive Changes

| Breakpoint | Change |
|------------|--------|
| `< 380px` | Auto-activate lamp. No avatar. Form fills screen. |
| `375-767px` | Auto-activate lamp. Avatar as 32px icon in header. Form fills screen. Social auth below submit. |
| `768-1023px` | Same as current but with document-style form. |
| `≥ 1024px` | Same as current but cleaner (no aurora, no grid, no pointer glow). |

### 10. Performance Optimizations

| Optimization | Impact |
|-------------|--------|
| Remove 3 aurora blobs | Removes 3 × `filter: blur(72px)` compositor layers |
| Remove pointer glow rAF loop | Removes ~60 calls/sec on desktop |
| Remove camera spring | Removes Framer Motion spring computation |
| Remove keystroke ripple | Removes SVG animation per keystroke |
| Reduce ember max from 20 to 12 | Reduces CSS animation count |
| Remove glow-border animation | Removes continuous CSS animation on form |

### 11. Accessibility Improvements

| Improvement | Detail |
|-------------|--------|
| Contrast fix | Check emerald-400/80 on #04060f. Increase to emerald-400 if needed. |
| Heading hierarchy | Form title "ENTRY PASS" as `<h2>` |
| Social auth labels | Add `aria-label="Sign in with Google"` / `aria-label="Sign in with Apple"` |
| Form title | Add `aria-label` for screen readers |

### 12. Migration Strategy

1. **Phase 1 (Non-breaking):** Remove aurora blobs, floor grid, pointer glow, camera spring. Test thoroughly. Deploy.
2. **Phase 2 (Non-breaking):** Remove keystroke ripple, node pulse, wave, sparkles. Reduce ember count. Test. Deploy.
3. **Phase 3 (Breaking):** Replace form card with document-style container. Replace AuthField with UnderlineField. Update choice screen copy. Test thoroughly. Deploy.
4. **Phase 4 (Non-breaking):** Add quiet mode. Add contrast fixes. Add heading hierarchy. Test. Deploy.

### 13. Implementation Phases

| Phase | Scope | Risk | Est. Time |
|-------|-------|------|-----------|
| 1: Subtraction | Remove aurora, grid, pointer glow, camera spring, keystroke animations | Low | 2-3 hours |
| 2: Form redesign | Document-style form, underline fields, static border | Medium | 4-6 hours |
| 3: Choice screen | New copy, remove 3D tilt, add title | Low | 1-2 hours |
| 4: Unit-9 refinement | Remove wave/sparkles, reduce keystroke reactions | Low | 1-2 hours |
| 5: Quiet mode | Environment quiets during form interaction | Medium | 2-3 hours |
| 6: Mobile reconstruction | Auto-activate lamp, full-height form, icon avatar | Medium | 3-4 hours |
| 7: Verification skip | Skip on login, keep on signup | Low | 30 min |
| 8: Accessibility audit | Contrast, headings, aria-labels | Low | 1-2 hours |
| **Total** | | | **14-22 hours** |

### 14. Estimated Complexity

**Overall: Medium.** The changes are predominantly subtractive (removing elements) and cosmetic (restyling). No new backend logic. No new state machine states. No new API routes. The most complex parts are the underline field component and the quiet mode implementation.

### 15. Regression Risks

| Risk | Mitigation |
|------|------------|
| Removing aurora blobs changes landing page | Only remove from auth. Keep in globals.css. |
| Underline fields break autofill | Test with Chrome, Safari, Firefox password managers. Standard `<input>` elements ensure compatibility. |
| Quiet mode causes visual jump | Use CSS transitions (opacity, not layout) for quiet level changes. |
| Mobile auto-activate breaks lamp metaphor | The lamp metaphor is desktop-only. Mobile users never saw the full lamp scene anyway (< 380px already skips it). |
| Removing auto-redirect on success | Users may not click "Enter the hall." Add a subtle pulsing animation to the button to draw attention. |

---

*End of Auth 2.0 research. This document is for decision-making only. No code has been modified. Await approval before implementation.*
