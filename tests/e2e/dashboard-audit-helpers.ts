// tests/e2e/dashboard-audit-helpers.ts
// Shared helpers for the all-tabs dashboard audit (P0 guardrail, see
// docs/DASHBOARD_UI_UX_FIX_PLAN.md). Modelled on practice-audit.spec.ts:
// real dev server, real database, axe-core injected from node_modules.
//
// Every scan reports structured findings so the spec can ratchet against
// tests/e2e/dashboard-audit-baseline.json: counts may improve freely, but
// any regression over the baseline fails. AUDIT_STRICT=1 ignores the
// baseline entirely (the Definition-of-Done gate once phases P1–P7 land).

import { expect } from '@playwright/test';
import type { Browser, Cookie, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/** All 19 dashboard tab slugs (must match frontend/lib/data/index.ts TABS). */
export const TAB_SLUGS = [
  'home',
  'practice',
  'question-bank',
  'mistakes',
  'progress',
  'flashcards',
  'study-planner',
  'exam-history',
  'real-exam',
  'vocab',
  'current-affairs',
  'settings',
  'ai-solver',
  'ai-mock',
  'advisor',
  'evaluator',
  'voice-interview',
  'student-model',
  'usage',
] as const;

export const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 360, height: 740 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
  { width: 1536, height: 900 },
] as const;

const AXE_PATH = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

export const THEME_KEY = '9th-grade-ai-dashboard-theme';
export const LANG_KEY = '9th-grade-ai-lang';

type Theme = 'dark' | 'light';
type Lang = 'bn' | 'en';

/**
 * Documented exceptions to the 44px touch-target floor. Each entry is a
 * `closest()` selector — the element or one of its ancestors must match.
 * Keep this list tiny and justify every addition in docs/DESIGN-SYSTEM.md.
 */
export const TOUCH_TARGET_ALLOWLIST = [
  // Dense question-palette jump grid — 36px is an approved density trade-off
  // (PracticeTab's own palette already uses 44px; the exam-session palette
  // keeps 36px to fit ~50 buttons without scrolling).
  '[role="group"][aria-label="প্রশ্ন তালিকা"]',
];

/** Sets theme + language before any page script runs (pre-paint safe). */
export async function usePrefs(page: Page, theme: Theme, lang: Lang): Promise<void> {
  await page.addInitScript(
    (args) => {
      try {
        localStorage.setItem(args.themeKey, args.theme);
        localStorage.setItem(args.langKey, args.lang);
      } catch {
        /* storage unavailable */
      }
    },
    { themeKey: THEME_KEY, theme, langKey: LANG_KEY, lang },
  );
}

/** Switches theme + language on an already-loaded page and reloads. */
export async function reloadWithPrefs(page: Page, theme: Theme, lang: Lang): Promise<void> {
  await page.evaluate(
    (args) => {
      localStorage.setItem(args.themeKey, args.theme);
      localStorage.setItem(args.langKey, args.lang);
    },
    { themeKey: THEME_KEY, theme, langKey: LANG_KEY, lang },
  );
  await page.reload();
}

// ── Auth ────────────────────────────────────────────────────────────────────

/**
 * Creates one audit user via the stable API seam (POST /api/auth/register →
 * 201 + session cookie), completes onboarding once, and returns a saved
 * storage-state file the whole suite shares. Registering per-test bursts the
 * rate limiter under parallel workers (429) — and a zero-history account is
 * exactly the first-time-user state, so every empty state is audited.
 */
export async function createAuditUser(browser: Browser, statePath: string): Promise<string> {
  // Idempotent: workers race on this file, and per-worker registrations both
  // burst the rate limiter and starve /auth/refresh (20/min IP-keyed) —
  // starved refreshes log users out mid-sweep. First writer registers and
  // saves; everyone else reuses the existing session.
  try {
    const existing = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { cookies: unknown[] };
    if (Array.isArray(existing.cookies) && existing.cookies.length > 0) return statePath;
  } catch {
    /* missing/unreadable — register below */
  }
  // Explicitly clear storageState: this runs *before* the state file exists,
  // but the spec's test.use({ storageState }) is inherited by newContext().
  // baseURL is needed for relative goto() on a manually created context.
  const context = await browser.newContext({ storageState: undefined, baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  try {
    // Registration is rate-limited; parallel workers each call beforeAll, so
    // retry with backoff instead of racing the limiter. Email must be unique
    // per attempt — workers starting in the same millisecond collide (409).
    const attemptPost = () =>
      page.request.post('/api/auth/register', {
        data: {
          name: 'Audit User',
          email: `audit+${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`,
          password: `Audit#9th-${Date.now()}!xQz`,
        },
      });
    let res = await attemptPost();
    for (let attempt = 0; attempt < 6 && res.status() === 429; attempt++) {
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
      res = await attemptPost();
    }
    expect(res.status(), 'register status').toBe(201);

    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 30_000 });
    if (page.url().includes('/onboarding')) {
      await page.selectOption('#examTarget', 'BCS');
      await page.fill('#examDate', '2026-12-31');
      await page.selectOption('#prepLevel', 'BEGINNER');
      await page.fill('#studyHoursPerDay', '3');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    }
    await context.storageState({ path: statePath });
  } finally {
    await context.close();
  }
  return statePath;
}

// ── Settling ────────────────────────────────────────────────────────────────

/**
 * Framer-motion entrances leave ancestor opacity < 1 mid-flight, and axe
 * blends ancestor opacity into contrast ratios — scanning during the
 * entrance reports phantom violations. Wait until surfaces settle.
 */
export async function waitForVisualCalm(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLElement>('#dashboard-content, [role="dialog"], [role="timer"]')].every(
          (e) => getComputedStyle(e).opacity === '1',
        ),
      null,
      { timeout: 15_000 },
    );
  } catch {
    /* settle best-effort only — never fail the audit on the helper itself */
  }
  await page.waitForTimeout(400);
}

/** Shared session file — one registration per run (see createAuditUser). */
export const AUTH_STATE_PATH = path.join(process.cwd(), 'test-results', 'dashboard-audit-auth.json');

/**
 * Waits for the dashboard shell + meaningful tab content, then settles.
 * Self-healing: a transient /auth/refresh failure (the client hard-logs-out
 * on any refresh error, and the remote DB blips intermittently) clears the
 * cookie in-context — re-inject the saved session and reload instead of
 * failing the whole sweep on infrastructure flake.
 */
export async function waitForTabReady(page: Page, tabUrl: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.waitForSelector('#dashboard-content', { timeout: 20_000 });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      try {
        const state = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8')) as { cookies: Cookie[] };
        await page.context().addCookies(state.cookies);
      } catch {
        /* state file unreadable — retry anyway */
      }
      await page.goto(tabUrl);
      await page.waitForTimeout(800);
    }
  }
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector('#dashboard-content');
        return !!main && (main.textContent ?? '').trim().length > 20;
      },
      null,
      { timeout: 30_000 },
    )
    .catch(() => {
      /* some tabs legitimately render near-empty states; scans will see it */
    });
  await waitForVisualCalm(page);
}

// ── Scans ───────────────────────────────────────────────────────────────────

export type OverflowHit = string;
export type TargetHit = string;
export type TextHit = string;

export type AxeViolation = {
  id: string;
  impact?: string;
  help: string;
  count: number;
  targets: string[];
};

export async function checkOverflow(page: Page, label: string): Promise<OverflowHit[]> {
  const { docW, winW } = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
  }));
  if (docW > winW + 1) return [`${label}: document ${docW}px > viewport ${winW}px`];
  return [];
}

/**
 * Every visible interactive element must be ≥44×44 CSS px, minus the
 * documented allowlist. Reports a stable descriptor per violation.
 */
export async function collectTouchTargets(page: Page): Promise<TargetHit[]> {
  return page.evaluate((allowlist) => {
    const SEL =
      'a[href], button, [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [role="option"], input:not([type="hidden"]), select, summary, [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(SEL))) {
      if (allowlist.some((a) => el.closest(a))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue; // clipped / offscreen
      if (r.width >= 44 && r.height >= 44) continue;
      const cls =
        typeof el.className === 'string' && el.className
          ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} ${Math.round(r.width)}x${Math.round(r.height)} :: ${name}`);
    }
    return out;
  }, TOUCH_TARGET_ALLOWLIST);
}

/**
 * Every element rendering visible text must use ≥11px computed font-size
 * (--text-xs is 11px; the design-system floor for Bengali legibility).
 */
export async function collectTextSizes(page: Page): Promise<TextHit[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || !text.trim()) continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('.sr-only, [aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      const px = parseFloat(cs.fontSize);
      if (px > 0 && px < 11) {
        out.push(`${px}px ${el.tagName.toLowerCase()} :: ${text.trim().replace(/\s+/g, ' ').slice(0, 40)}`);
      }
    }
    return out;
  });
}

export async function axeSeriousOrCritical(page: Page): Promise<AxeViolation[]> {
  await waitForVisualCalm(page);
  await page.addScriptTag({ path: AXE_PATH });
  const violations = (await page.evaluate(() =>
    (
      window as unknown as {
        axe: {
          run: (doc: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; impact?: string; help: string; nodes: Array<{ target: string[] }> }> }>;
        };
      }
    ).axe
      .run(document, { resultTypes: ['violations'] })
      .then((r) =>
        r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          count: v.nodes.length,
          targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        })),
      ),
  )) as AxeViolation[];
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

// ── Ratchet baseline ────────────────────────────────────────────────────────

export type TabBaseline = {
  overflow: number;
  touchTargets: number;
  textSizes: number;
  axeRules: string[];
};

export type AuditBaseline = Record<string, TabBaseline>;

const BASELINE_PATH = path.join(process.cwd(), 'tests', 'e2e', 'dashboard-audit-baseline.json');

export function loadBaseline(): AuditBaseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as AuditBaseline;
  } catch {
    return {};
  }
}

export function strictMode(): boolean {
  return process.env.AUDIT_STRICT === '1';
}

/**
 * Ratchet assertion: current counts must not exceed the recorded baseline
 * (a missing baseline entry means zero tolerated). Counts below the
 * baseline pass — the run logs the improvement so the baseline can shrink.
 */
export function expectWithinBaseline(
  tab: string,
  current: { overflow: number; touchTargets: number; textSizes: number; axeRules: string[] },
  context: string,
): void {
  const baseline = loadBaseline();
  const base = strictMode()
    ? { overflow: 0, touchTargets: 0, textSizes: 0, axeRules: [] as string[] }
    : (baseline[tab] ?? { overflow: 0, touchTargets: 0, textSizes: 0, axeRules: [] });

  const problems: string[] = [];
  if (current.overflow > base.overflow) problems.push(`overflow ${current.overflow} > baseline ${base.overflow}`);
  if (current.touchTargets > base.touchTargets)
    problems.push(`touch targets ${current.touchTargets} > baseline ${base.touchTargets}`);
  if (current.textSizes > base.textSizes) problems.push(`text sizes ${current.textSizes} > baseline ${base.textSizes}`);
  const newRules = current.axeRules.filter((r) => !base.axeRules.includes(r));
  if (newRules.length > 0) problems.push(`new axe rules: ${newRules.join(', ')}`);

  expect(
    problems,
    `${context} — audit regressions over baseline (see docs/DASHBOARD_UI_UX_FIX_PLAN.md):\n${problems.join('\n')}`,
  ).toEqual([]);

  const improvements: string[] = [];
  if (current.overflow < base.overflow) improvements.push(`overflow ${base.overflow} → ${current.overflow}`);
  if (current.touchTargets < base.touchTargets)
    improvements.push(`touch targets ${base.touchTargets} → ${current.touchTargets}`);
  if (current.textSizes < base.textSizes) improvements.push(`text sizes ${base.textSizes} → ${current.textSizes}`);
  const resolved = base.axeRules.filter((r) => !current.axeRules.includes(r));
  if (resolved.length > 0) improvements.push(`axe rules resolved: ${resolved.join(', ')}`);
  if (improvements.length > 0) {
    console.log(`[audit:${tab}] improved — shrink the baseline: ${improvements.join('; ')}`);
  }
}
