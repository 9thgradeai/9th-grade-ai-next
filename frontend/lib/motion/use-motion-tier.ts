"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useMotionCapabilities, type DeviceTier } from "./device";

/**
 * Command Deck motion gate — the single source of truth for whether Home tab
 * choreography may run. Combines the existing device-tier detection
 * (`useMotionCapabilities`) with `prefers-reduced-motion`; accessibility
 * always wins. Every animation added by the Command Deck pass must consume
 * this hook — never re-implement the detection inline per section.
 *
 * - `fullMotion`: false on low-tier devices or reduced-motion → snap to the
 *   final state instantly (opacity/transform only, no keyframes).
 * - `tier` / `reducedMotion`: exposed for copy-level decisions if ever needed.
 */
export function useMotionTier(): {
  tier: DeviceTier;
  reducedMotion: boolean;
  fullMotion: boolean;
} {
  const caps = useMotionCapabilities();
  const reducedMotion = useReducedMotion() ?? false;
  return {
    tier: caps.tier,
    reducedMotion,
    fullMotion: !reducedMotion && caps.tier !== "low",
  };
}

/**
 * First-mount gating (§3.3) — identical pattern for every section that must
 * animate once (heatmap stagger, sparkline height-in, delta count-up):
 *
 *   const animateOnce = useFirstMountAnimate(enabled);
 *   <motion.div initial={animateOnce ? "hidden" : false} animate="show" … />
 *
 * True only on the first committed render where `enabled` is true; the
 * closing effect flips it so all later renders (silent revalidation,
 * identical data) render the final state directly and entrance animations
 * never re-fire. State-based (no ref read during render) so it stays
 * react-compiler clean.
 */
export function useFirstMountAnimate(enabled: boolean): boolean {
  const [hasAnimated, setHasAnimated] = useState(false);
  useEffect(() => {
    if (enabled && !hasAnimated) setHasAnimated(true);
  }, [enabled, hasAnimated]);
  return enabled && !hasAnimated;
}
