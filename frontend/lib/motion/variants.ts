import type { Variants } from "framer-motion";

/**
 * Shared motion language for the landing experience.
 *
 * Three speed classes (micro 150–250ms, UI 300–600ms, cinematic 600–1000ms)
 * share one ease family so the page reads as a single system.
 */
export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

/** Spring configurations — per design-motion-principles: real-world mass and physics. */
export const SPRING = {
  soft: { type: "spring" as const, stiffness: 100, damping: 20 },
  snappy: { type: "spring" as const, stiffness: 300, damping: 25 },
  gentle: { type: "spring" as const, stiffness: 60, damping: 15 },
  magnetic: { type: "spring" as const, stiffness: 220, damping: 18, mass: 0.4 },
} as const;

/** UI-class reveal: fade + rise, used by scroll-triggered content. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

/** Cinematic-class entrance reserved for the hero. */
export const heroItem: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: EASE_OUT_EXPO },
  },
};

export function staggerParent(stagger = 0.08, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

/** Purpose registry — every motion primitive documents what it communicates. */
export const MOTION_PURPOSE = {
  fadeRise: "Reveals scroll-triggered content with a gentle fade-up",
  heroItem: "Hero entrance — first impression, slow cinematic reveal",
  staggerParent: "Cascading child reveals — creates rhythm in groups",
  springMagnetic: "Magnetic cursor tracking — physical pull toward cursor",
  springNav: "Navigation open/close — tactile panel expansion",
  springTabSwitch: "Tab bar transitions — smooth content swaps",
} as const;
