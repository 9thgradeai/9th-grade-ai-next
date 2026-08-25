"use client";

import { useSyncExternalStore } from "react";

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

let clientCaps: MotionCapabilities | null = null;

function getClientCaps(): MotionCapabilities {
  if (!clientCaps) {
    const tier = detectDeviceTier();
    clientCaps = {
      tier,
      pointerEffects: hasFinePointer() && !prefersReducedMotion() && tier !== "low",
      continuousEffects:
        !prefersReducedMotion() && tier !== "low" && document.visibilityState === "visible",
    };
  }
  return clientCaps;
}

function noopSubscribe() {
  return () => {};
}

/**
 * Returns capabilities. During SSR and hydration it reports a conservative
 * baseline (no pointer effects, no continuous loops); after mount React
 * re-renders with the detected client capabilities — without a mismatch
 * warning, thanks to useSyncExternalStore.
 */
export function useMotionCapabilities(): MotionCapabilities {
  return useSyncExternalStore(noopSubscribe, getClientCaps, () => STATIC_CAPS);
}
