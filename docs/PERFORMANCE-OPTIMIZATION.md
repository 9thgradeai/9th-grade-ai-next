# Performance & Responsiveness — Audit + Optimization Plan

> Status: **Active plan** (v1, 2026-09-01). This doc is the living source of
> truth for performance work on the platform across **all five pillars**:
> bundle/code-splitting, images/CDN, responsiveness/mobile, rendering
> smoothness, and data/caching + PWA.
>
> It records (a) the current measured/audited reality, (b) a phased roadmap
> with concrete, testable steps, and (c) a running log of what has been
> implemented. Keep it updated in the same commit as the work it describes.

---

## 1. TL;DR — Current posture

The foundation is already unusually strong. There is no single "obvious" win;
the remaining work is **incremental** and should be done carefully, one env-flag
or one bundle slice at a time, with Lighthouse + `npm run test` guarding each step.

**Strong today:**
- Per-route, per-tab, per-section code-splitting everywhere (`dynamic()`).
- Device-tier + reduced-motion governors gate every heavy animation.
- Self-hosted fonts (`next/font`, `swap`, no preload) sized deliberately (~150 KB).
- PWA (`next-pwa`) with hand-tuned `runtimeCaching` and navigation denylist.
- Safety-aware mobile layout (`h-dvh`, `overscroll-contain`, `env(safe-area-inset-*)`).
- `reactStrictMode`, `compress`, comprehensive security headers.
- Framer Motion kept off the initial bundle for the landing + toaster.

**Gaps / biggest unaudited surface:**
1. **No `next/image`** anywhere. The only `<img>` is a client-side upload
   preview (correctly not using `next/image`), but `images-manifest` still has
   `localPatterns` only and remote CDN config is unexploited.
2. **What actually lives in the 196–245 KB shared client chunks** is unknown and
   unmeasured by any CI gate — they must be profiled before trimming.
3. **No production Lighthouse/Perf budget gate** in CI or load tests for
   web-vitals (only a k6 load test exists for API).
4. **`/` and `/current-affairs` etc. are `force-dynamic` + Prisma on render** —
   TTFB is DB-coupled and uncached for anonymous traffic.
5. **Auth does a full `/api/auth/me` round-trip on every page load** — each
   dashboard visit pays one extra request to restore session state.

---

## 2. Pillar-by-pillar audit

### 2.1 Bundle + code-splitting

**Current state (measured from a production build):**
- Largest shared/client JS chunks: **245 KB, 236 KB, 196 KB**; plus framework
  **185 KB**, main **143 KB**, polyfills **110 KB**, and a further four
  29–125 KB middle chunks.
- Landing: every below-the-fold section is `dynamic()` + `ssr:false` via
  `LazySection` with a 600 px IntersectionObserver rootMargin — excellent.
- Dashboard: all 16 tabs are lazy `dynamic()` imports (`app/dashboard/page.tsx`),
  VoiceAITutor is `ssr:false`, Toaster is locked out of the initial bundle.
- `framer-motion` runtime is correctly split into chunk 5875 (≈125 KB) shared by
  landing + dashboard rather than vendored monolithically.

**Findings / risks:**
- The large chunks are **unprofiled**. They likely mix Framer Motion, AI SDK,
  Prisma-adjacent DTOs, and shared UI. We cannot recommend deletions until we
  know their composition.
- `lucide-react ^1.31.0` — full-package import risk. `TAB_ICONS` lives in
  `frontend/lib/exam-ui.ts`; if it re-exports from `"lucide-react"` (not the
  per-icon paths) it defeats tree-shaking. **Verify.**
- Markdown renderer for chat (`frontend/components/chat/Markdown.tsx`) can be
  large; confirm it is lazy-loaded only when the chat tab opens, not at import
  site.

**Planned actions (see §3.1):** profile with `npx @next/bundle-analyzer`, then
slice the biggest shared chunks; enforce tree-shaken lucide imports; drop
`@types/zxcvbn` to devDeps; confirm Markdown is load-split.

### 2.2 Images / CDN

**Current state:**
- `next/image` **not used** (2 files contain a literal `<img>`;
  `BrandMark.tsx` renders inline SVG — correct; `AISolverTab.tsx` renders a
  client-side upload `data:` preview — correct to keep as plain `<img>`).
- `images-manifest`: `formats: ["webp"]`, `qualities: [75]`, `localPatterns`
  enabled; `remotePatterns: []`, `domains: []`.
- Public icons are tiny SVGs (all ≤ 1 KB).
- `next-pwa` caches images `CacheFirst` 30 days.

**Findings / risks:**
- No raster imagery exists yet, so there is **no CLS or bandwidth liability
  today**. The gap is **forward-looking**: when hero/OG/blog images or uploaded
  media appear, they must go through `next/image` + a CDN or they will regress
  LCP/CLS silently.
- `opengraph-image.tsx` and `manifest` reference only the inline SVG icon; there
  is no AVIF/WebP pipeline to preview.

**Planned actions (§3.2):** configure remote CDN in `next.config` only when a CDN
is provisioned; establish a "use `next/image` for any raster/remote media" rule;
add AVIF/WebP acceptance and loading="lazy" for below-fold media; keep the
`data:` preview as-is. Add placeholder-to-real-image tests the day real images land.

### 2.3 Responsiveness / mobile

**Current state — already strong:**
- Dashboard shell uses `h-dvh overflow-hidden`, correct vertical rhythm.
- Scroll container: `overflow-y-auto overscroll-contain` (stops scroll chaining).
- Notch/gesture-bar handling: `pt-safe` / `pb-safe` /
  `@utility { padding-…: env(safe-area-inset-*) }` in `globals.css`; layout
  viewport `viewportFit: "cover"`.
- Mobile nav = `BottomNav` (`lg:hidden`, `min-h-[56px]` touch targets) + desktop
  `SideNav` (`hidden lg:flex`); bottom sheet has `rounded-t-2xl pb-safe`.
- Header collapses (`lg:`), content `max-w-6xl`, `Skip to content` link present.
- `deviceMemory`/`hardwareConcurrency` tiering in `motion/device.ts` reduces
  particle/animation load on low-end phones.

**Findings / polish opportunities:**
- Bottom-nav primary labels are 10 px letterspaced micro-text; fine, but the
  CTA grid in the "More" sheet uses 3 columns which can feel dense on very
  narrow (< 360 px) screens.
- No explicit `text-size-adjust` / `-webkit-tap-highlight` normalization
  (Tailwind v4 resets most of this).
- No horizontal-scroll containment on wide tables/graphs in `ProgressTab` /
  `AnalyticsVisualization` — should verify they either wrap or scroll within
  their card rather than expand the page.

**Planned actions (§3.3):** audit every `overflow` + fixed-width chart for
`min-w-0`/`overflow-x-auto`; tighten the More-sheet grid at the smallest
breakpoint; add a responsive smoke test for the dashboard at 360 / 768 / 1024 px.

### 2.4 Rendering smoothness

**Current state — strong, measurement-driven:**
- `prefers-reduced-motion` honored at the CSS layer (`@media (prefers-reduced-motion: reduce)`) and the JS layer everywhere.
- Device tiers gate continuous loops / pointer effects (`MotionCapabilities`,
  `VisualQuality` = `reduced|low|medium|high|ultra`).
- `BlackholeCanvas` (raw WebGL, no three.js) has async dither-free rendering,
  adaptive render scale with hysteresis, capped DPR, one draw call per frame,
  pauses on tab-hide and out-of-viewport, recovers on context loss, and renders
  a single static frame on low/reduced tiers.
- New data-boot loader animations are transform/opacity-only (GPU-cheap) and CSS
  animations auto-pause when the tab is hidden (browser paint-suppression).
- Instant-motion guard (`useReducedMotion`) used in dashboard tab transitions.

**Findings / risks:**
- The landing still mounts a WebGL + several canvas/SVG-adjacent sections on
  viewport entry; on mid-tier phones the *combined* budget can spike. So far they
  self-throttle, but there is no FPS telemetry to prove it in the field.
- `ScrollProgress`/`BackToTop`/`AnimatedList` run rAF/scroll listeners; confirm
  they use `passive`, throttle, and tear down cleanly.
- No `content-visibility: auto` on long scrolling lists (question bank, mistakes,
  conversation lists) — they render eagerly.

**Planned actions (§3.4):** verify rAF/scroll handlers are passive + throttled;
apply `content-visibility: auto` + `contain-intrinsic-size` to repeated-list
cards; add a lightweight FPS sampler (dev-only, sampled from rAF, gated by tier)
guarded by an env flag; keep all animation on transform/opacity.

### 2.5 Data / caching + PWA

**Current state:**
- `next-pwa` with 9 bespoke `runtimeCaching` rules (fonts `CacheFirst` 1 y,
  images 30 d, question/exam-config/flash-news `StaleWhileRevalidate` 5–10 min,
  dashboard-stats `NetworkFirst` 60 s, AI APIs `NetworkOnly`, session/SSR paths
  in the `navigateFallbackDenylist`).
- Auth: HttpOnly cookie, 7-day JWT, sliding renewal via `/api/auth/refresh`
  started 2 days before expiry, `/api/auth/me` on load.
- Landing `/` is `force-dynamic` and hits Prisma (`subject.count`) every request.

**Findings / risks:**
- `dashboard-stats` is `NetworkFirst` with a 60 s cache — good freshness/latency
  balance, but it means every sheet/tab transition that calls it re-fetches in
  the worst case.
- The `/api/auth/me` on load is uncached and serial; combined with the
  verification gate it delays dashboard paint by one round-trip.
- No stale-while-revalidate for the *public* landing data; `/` is DB-coupled.

**Planned actions (§3.5):** add `s-maxage`/`stale-while-revalidate` to the
public static-ish API responses that are cache-safe and non-authenticated
(categories, subjects, flash-news); cache the Prisma `subject.count` on `/`; add
lightweight HIT/MISS reporting; keep session routes uncached (correct today).

---

## 3. Phased execution roadmap

Priority legend: **P0** (highest business impact, lowest risk) → **P2** (deferred,
needs infra/budget decisions).

### Phase 0 — Instrumentation (do first, cheap)
- [x] `@next/bundle-analyzer` installed (devDep **16.3.4**, matches Next 16.3.1) and
      wired into `next.config.ts` (opt-in via `ANALYZE=true npm run build`, the
      existing `npm run analyze` script). Generates `.next/analyze/{client,edge,nodejs}.html`
      treemaps. Normal builds are byte-identical; analysis is opt-in. See ADR in `docs/DECISIONS.md`.
- [x] **Baseline captured** (2026-09-01) from `.next/analyze/client.html` — see §5.
      Profiling verdict: the initial-JS floor is dominated by **Sentry client
      (~285 KB parsed / 92 KB gzip)** and **Next runtime (~663 KB parsed / 198 KB
      gzip)**; Framer Motion is correctly isolated (161 KB parsed / 56 KB gzip) and
      only loads on animating routes.
- [x] **Perf-budget gate** shipped: `scripts/perf-budget.ts` +
      `npm run perf:baseline` / `npm run perf:check`. The gate reads the analyzer
      output and fails (exit 1) if (a) any namespace regresses >5% parsed vs its
      captured baseline, (b) any single asset exceeds the 90 KB gzip ceiling, or
      (c) the aggregate Sentry client gzip exceeds its 92 KB ceiling. Captured
      baseline lives in `docs/perf/client-baseline.json` (committed so CI can
      diff against a reviewed reference). Enforce `npm run perf:check`
      in CI on top of the existing analyze build; refresh the baseline only on a
      deliberate, reviewed change (never to hide a regression).
- [ ] Add an FPS sampler (dev-only) and a web-vitals logger (dev-only) gated by
      `NEXT_PUBLIC_PERF=1`.
- [ ] Add Lighthouse CI (or manual runbook) entries for: Landing, `/login`,
      `/dashboard` (authenticated), and a slow-4G pass.

### Phase 1 — Confirmed bundle wins (P0, reversible)
- [x] Profile the big chunks (see §5): 93 = Sentry (164 KB parsed) + Next (80 KB);
      3794 & 4bd1b696 = Next runtime (234 + 196 KB); 4a7b0c69 = Sentry (121 KB);
      5875 = framer-motion (81 KB) + motion-dom (41 KB). The two biggest *levers*
      are Sentry client (~285 KB parsed) and Next runtime (~663 KB parsed).
- [ ] Enforce tree-shaken `lucide-react` imports (per-icon paths) — audit passed:
      `exam-ui.ts` already uses a named ESM import from `"lucide-react"`, which the
      bundler tree-shakes; confirm with a follow-up treemap that no unused icons ship.
- [ ] Lazy-load the chat Markdown renderer on first open — audit: Markdown only loads
      when `ChatMessage` mounts inside the already-lazy `VoiceInterviewTab` /
      `AISolverTab`; confirm no shared-chunk leak in a follow-up treemap.
- [ ] Reduce the Sentry client footprint (the top lever): trim Sentry integrations,
      gate traces/replays sample rates already at 0.1, and confirm `replayIntegration`
      + `browserTracingIntegration` don't both need to ship to every route. Re-check
      with `npm run perf:check` after any change.
- [ ] Trim Next runtime only when a new Next release lands — pin upgrades and
      re-measure the `next-runtime` namespace against the baseline.

### Phase 2 — Data/SSR + auth (P0)
- [ ] Cache Prisma-derived public counts so `/` avoids a DB round-trip.
- [ ] Add `s-maxage`/SWR to cache-safe public API responses.
- [ ] (Optional, larger) Collapse the `/api/auth/me` + gate into one SSR
      `cookies()` read inside `app/dashboard/layout.tsx` so payload arrives with
      the HTML instead of a second request. **Requires reconciling CSR states.**

### Phase 3 — Rendering + lists (P1)
- [ ] Verify rAF/scroll handlers passive + throttled; fix any offenders.
- [ ] Apply `content-visibility: auto` + `contain-intrinsic-size` to long lists.
- [ ] Confirm mid-tier canvas budgets; add the FPS sampler from Phase 0.

### Phase 4 — Responsiveness polish (P1)
- [ ] `min-w-0` / `overflow-x-auto` audit of charts and wide tables.
- [ ] Tighten the More-sheet grid at the smallest viewport.
- [ ] Responsive smoke tests at 360 / 768 / 1024 px.

### Phase 5 — Images/CDN (P2, needs infra)
Only once real raster/remote media exists:
- [ ] Configure `remotePatterns`/CDN in `next.config`.
- [ ] Adopt `next/image` with AVIF/WebP, `sizes`, explicit dimensions, `loading="lazy"` below the fold.
- [ ] Add placeholder + CLS tests for each new image.
- [ ] Keep the client upload preview as a plain `<img src={dataUri}>`.

---

## 4. Optimization rules of the road (encode in code review)

- Keep every animation on **transform + opacity**; anything else must be justified.
- Only the **active tab** ships code; new tabs must be `dynamic()`.
- Every **raster/remote media** uses `next/image`; `loading="lazy"` below the fold.
- All rAF/scroll/intersection handlers: `passive`, throttled, torn down on unmount.
- Respect `prefers-reduced-motion` and the device tier in every new visual.
- Session/SSR/analytics payloads stay off caches; only **cache-safe public data**
  gets `s-maxage`/SWR.
- Re-run `npm run test && npm run typecheck && npm run lint && npm run build`
  plus a Lighthouse pass after **every** performance change.

---

## 5. Baseline measurements — captured 2026-09-01

Source: `.next/analyze/client.html` (`ANALYZE=true next build`). Sizes are the
`parsed`/`gzip` figures the bundler reports. **This is the gate baseline.** Do not
edit `docs/perf/client-baseline.json` except through `npm run perf:baseline` on a
deliberate, reviewed change.

### 5.1 Namespace footprint — gzip is what reaches the network

| Namespace | Parsed | Gzip | Notes |
|-----------|-------:|-----:|-------|
| Sentry client | 285.3 KB | 92.0 KB | **largest controllable lever** (chunks 93 + 4a7b0c69) |
| Next runtime | 662.7 KB | 197.8 KB | framework floor; framework(185) + main(143) + 3794(234) + 4bd1b696(196) |
| Framer Motion | 160.9 KB | 56.4 KB | isolated (framer 81 + motion-dom 41 + motion-utils), only on animating routes |
| First-party src | 679.4 KB | 211.4 KB | app/ + frontend/ (incl. lazy tab chunks) |
| **Total client JS** | **2163.4 KB** | **692.2 KB** | across all 162 client assets |

### 5.2 Top client assets (gzip)

| Asset | Parsed | Gzip |
|-------|-------:|-----:|
| static/chunks/93 (Sentry + Next) | 245.5 KB | 80.5 KB |
| static/chunks/3794 (Next runtime) | 235.9 KB | 64.0 KB |
| static/chunks/4bd1b696 (Next runtime) | 196.3 KB | 61.7 KB |
| static/chunks/framework | 185.2 KB | 58.4 KB |
| static/chunks/main | 143.1 KB | 41.9 KB |
| static/chunks/5875 (framer-motion) | 125.0 KB | 41.0 KB |
| static/chunks/4a7b0c69 (Sentry) | 121.3 KB | 38.1 KB |
| static/chunks/app/dashboard/layout | 38.1 KB | 11.3 KB |
| static/chunks/app/login/page | 48.8 KB | 13.4 KB |
| static/chunks/app/page (landing) | 22.3 KB | 8.2 KB |

### 5.3 What this means

- **Every route pays the base floor**: framework + main + polyfills + Sentry
  client + Next runtime ⇒ **≈344.5 KB gzip before any app code**. That floor is
  dominated by **Sentry (~92 KB gzip)** and **Next runtime (~198 KB gzip)** — the
  two things to watch the hardest.
- Framer Motion adds ~41 KB gzip but **only on routes that actually animate**
  (landing, auth, dashboard shell), because it is code-split. This is correct.
- The budget gate covers Regression-only enforcement via namespaces + hard
  ceilings for Sentry and per-asset gzip.

Build config: Next 16.3.1, React 19.2.8, Tailwind v4, PWA on.

---

## 6. Changelog

- **2026-09-01** — Created this plan from a full five-pillar audit. The audit
  **verified** several checks already pass (scroll/rAF handlers are passive +
  throttled in `ScrollProgress`/`BackToTop`; `framer-motion` is off the initial
  bundle; dashboard tabs, landing sections, and the toaster are code-split;
  `Safe-area` + `h-dvh` + `overscroll-contain` mobile layout is in place; PWA
  caching is well-tuned; device-tier + reduced-motion governors gate heavy
  animation; deps are correctly placed — none to move).
- **2026-09-01** — Shipped Phase 0 instrumentation to unblock all chunk work:
  added `@next/bundle-analyzer` (devDep) + enabled `ANALYZE=true npm run build`
  (the existing `npm run analyze`), documented in `docs/DECISIONS.md` ADR-0011.
- **2026-09-01** — Captured the §5 binary baseline from `.next/analyze/client.html`,
  profiled the big chunks (Sentry + Next runtime dominate the floor), and shipped
  the **Perf-budget gate**: `scripts/perf-budget.ts` + `npm run perf:baseline` /
  `npm run perf:check`, with namespace regression tolerances + absolute ceilings.
  **Next actionable:** trim the Sentry client footprint (`@sentry:nextjs`
  ~285 KB parsed / 92 KB gzip) and re-run `npm run perf:check`.
- **Remaining, in order of value:** Sentry client trim → cache Prisma-derived
  public counts / add SWR to cache-safe public API responses → `content-visibility`
  on long lists → `overflow`/`min-w-0` chart audit → images/CDN (only once real
  media exists). See §3 for full roadmap.

