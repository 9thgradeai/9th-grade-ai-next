"use client";

import { useSyncExternalStore, useEffect, useRef } from "react";

/**
 * Lightweight capability detection for the landing experience.
 *
 * Devices are classified once per session into three visual tiers:
 *  - high: full parallax, richer particles, pointer tilt, magnetic CTAs
 *  - mid:  normal Framer Motion, reduced particle counts, simpler parallax
 *  - low:  no continuous loops, static visuals, no pointer tracking
 *
 * `prefers-reduced-motion` is tracked separately (tier-independent) so
 * accessibility always wins over capability. Detection never affects the
 * rendered DOM on the server — it only gates behaviors inside effects and
 * event handlers, which keeps SSR markup and hydration in sync.
 */

export type DeviceTier = "high" | "mid" | "low";

type NavigatorWithMemory = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

let cachedTier: DeviceTier | null = null;

export function detectDeviceTier(): DeviceTier {
  if (typeof window === "undefined") return "mid";
  if (cachedTier) return cachedTier;

  const nav = navigator as NavigatorWithMemory;
  const cores =
    typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 4;
  const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 4;
  let score = 0;
  if (cores <= 2) score += 2;
  else if (cores <= 4) score += 1;
  if (memory <= 2) score += 2;
  else if (memory <= 4) score += 1;
  if (nav.connection?.saveData === true) score += 2;
  if (window.matchMedia("(pointer: coarse)").matches) score += 1;

  cachedTier = score >= 5 ? "low" : score >= 3 ? "mid" : "high";
  return cachedTier;
}

export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: fine)").matches;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type MotionCapabilities = {
  tier: DeviceTier;
  /** Pointer-driven depth effects are allowed at all. */
  pointerEffects: boolean;
  /** Continuous decorative loops are allowed at all. */
  continuousEffects: boolean;
};

const STATIC_CAPS: MotionCapabilities = {
  tier: "mid",
  pointerEffects: false,
  continuousEffects: false,
};

// Reactive store for motion capabilities
let currentCaps: MotionCapabilities = STATIC_CAPS;
let capsInitialized = false;
const listeners = new Set<() => void>();

function computeCaps(): MotionCapabilities {
  if (typeof window === "undefined") return STATIC_CAPS;
  const tier = detectDeviceTier();
  return {
    tier,
    pointerEffects: hasFinePointer() && !prefersReducedMotion() && tier !== "low",
    continuousEffects:
      !prefersReducedMotion() &&
      tier !== "low" &&
      document.visibilityState === "visible",
  };
}

function notify() {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  // Lazy-initialize on first client snapshot request
  if (!capsInitialized && typeof window !== "undefined") {
    currentCaps = computeCaps();
    capsInitialized = true;
  }
  return currentCaps;
}

function getServerSnapshot() {
  return STATIC_CAPS;
}

// Initialize on client - also handles visibility/reduced-motion changes
if (typeof window !== "undefined") {
  // Initial compute after a microtask to ensure document is ready
  queueMicrotask(() => {
    currentCaps = computeCaps();
    capsInitialized = true;
    notify();
  });

  // Update on visibility change
  document.addEventListener("visibilitychange", () => {
    currentCaps = computeCaps();
    notify();
  });

  // Update on reduced-motion change
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener?.("change", () => {
    currentCaps = computeCaps();
    notify();
  });
}

/**
 * Returns capabilities. During SSR it reports a conservative
 * baseline (no pointer effects, no continuous loops); after mount React
 * re-renders with the detected client capabilities.
 */
export function useMotionCapabilities(): MotionCapabilities {
  const caps = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Force a re-check on mount in case microtask hasn't run yet
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    currentCaps = computeCaps();
    capsInitialized = true;
    notify();
  }, []);
  return caps;
}

/* ── Visual quality governor ──────────────────────────────────────── */

export type VisualQuality = "ultra" | "high" | "medium" | "low" | "reduced";

let cachedQuality: VisualQuality | null = null;

/**
 * Single source of truth for cinematic ambition across the auth experience.
 * Combines the coarse device tier with viewport size and reduced-motion:
 *   reduced  — essential transitions only
 *   low      — CSS-only environment, minimal decoration
 *   medium   — gradients, sparse particles, no continuous camera drift
 *   high     — reduced particles + limited parallax (default desktop)
 *   ultra    — full ambience on capable large screens
 */
export function detectVisualQuality(): VisualQuality {
  if (typeof window === "undefined") return "medium";
  if (prefersReducedMotion()) return "reduced";
  if (cachedQuality) return cachedQuality;

  const tier = detectDeviceTier();
  const viewportUnits = Math.min(window.innerWidth, window.innerHeight);
  if (tier === "low") cachedQuality = "low";
  else if (tier === "mid") cachedQuality = viewportUnits < 500 ? "medium" : "high";
  else cachedQuality = viewportUnits >= 700 ? "ultra" : "high";
  return cachedQuality;
}

const QUALITY_STATIC: VisualQuality = "medium";

function noopSubscribe() {
  return () => {};
}

export function useVisualQuality(): VisualQuality {
  return useSyncExternalStore(noopSubscribe, detectVisualQuality, () => QUALITY_STATIC);
}