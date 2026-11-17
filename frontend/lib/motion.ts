/**
 * Motion Presets & Utilities
 * Framer Motion variants and helpers for consistent animations.
 */

import { Variants, Transition } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// EASING CURVES
// ─────────────────────────────────────────────────────────────────────────────

export const easings = {
  linear:       'linear',
  easeIn:       [0.4, 0, 1, 1],
  easeOut:      [0, 0, 0.2, 1],
  easeInOut:    [0.4, 0, 0.2, 1],
  easeOutExpo:  [0.19, 1, 0.22, 1],
  easeOutCirc:  [0.075, 0.82, 0.165, 1],
  easeSpring:   [0.34, 1.56, 0.64, 1],
  easeBounce:   [0.68, -0.55, 0.265, 1.55],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// DURATION PRESETS (seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const durations = {
  instant: 0,
  fast:    0.12,
  normal:  0.20,
  slow:    0.30,
  cinematic: 0.50,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CORE VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Fade in + slide up (section entrance) */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
};

/** Fade in + scale (modal, drawer, popover) */
export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: durations.fast, ease: easings.easeOutExpo },
  },
};

/** Slide in from left (side drawer) */
export const slideInLeft: Variants = {
  hidden: { x: -300 },
  show: {
    x: 0,
    transition: { duration: durations.slow, ease: easings.easeOutExpo },
  },
};

/** Slide in from right */
export const slideInRight: Variants = {
  hidden: { x: 300 },
  show: {
    x: 0,
    transition: { duration: durations.slow, ease: easings.easeOutExpo },
  },
};

/** Slide in from bottom (bottom sheet) */
export const slideInBottom: Variants = {
  hidden: { y: '100%' },
  show: {
    y: 0,
    transition: { type: 'spring', stiffness: 340, damping: 32 },
  },
};

/** Slide down from top (dropdown, toast) */
export const slideDown: Variants = {
  hidden: { y: -100, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
};

/** Fade only (for content crossfade) */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: durations.fast, ease: easings.easeOut },
  },
};

/** Stagger container for lists */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

/** Stagger item */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Button tap feedback */
export const tapScale = {
  whileTap: { scale: 0.98 },
  transition: { duration: 0.08 },
};

/** Card hover lift */
export const hoverLift = {
  whileHover: {
    y: -2,
    transition: { duration: durations.fast, ease: easings.easeOutExpo },
  },
};

/** Card hover lift + shadow */
export const hoverLiftShadow = {
  whileHover: {
    y: -2,
    boxShadow: 'var(--shadow-lg)',
    transition: { duration: durations.fast, ease: easings.easeOutExpo },
  },
};

/** Input focus ring */
export const focusRing = {
  whileFocus: {
    boxShadow: '0 0 0 3px var(--focus-ring)',
    transition: { duration: durations.fast },
  },
};

/** Active/selected pulse */
export const activePulse = {
  animate: {
    boxShadow: [
      '0 0 0 0 var(--primary)',
      '0 0 0 4px transparent',
      '0 0 0 0 var(--primary)',
    ],
  },
  transition: { duration: 2, repeat: Infinity, ease: 'linear' },
};

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATEPRESENCE VARIANTS (for exit animations)
// ─────────────────────────────────────────────────────────────────────────────

export const exitFade: Variants = {
  exit: {
    opacity: 0,
    transition: { duration: durations.fast, ease: easings.easeIn },
  },
};

export const exitFadeScale: Variants = {
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: durations.fast, ease: easings.easeIn },
  },
};

export const exitSlideRight: Variants = {
  exit: {
    x: 300,
    opacity: 0,
    transition: { duration: durations.normal, ease: easings.easeIn },
  },
};

export const exitSlideLeft: Variants = {
  exit: {
    x: -300,
    opacity: 0,
    transition: { duration: durations.normal, ease: easings.easeIn },
  },
};

export const exitSlideDown: Variants = {
  exit: {
    y: '100%',
    opacity: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: durations.fast, ease: easings.easeIn },
  },
};

export const pageTransitionInstant: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// REDUCED MOTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns variants that respect prefers-reduced-motion.
 * When reduced motion is preferred, animations complete instantly.
 */
export function createReducedMotionVariants<T extends Variants>(
  fullMotion: T,
  reducedMotion: T = { hidden: {}, show: {} } as unknown as T
): { initial: false | keyof T; animate: keyof T; variants: T; } {
  // This is a helper - actual reduced motion handling is done via
  // MotionConfig in layout.tsx and useReducedMotion hook in components
  return {
    initial: 'hidden',
    animate: 'show',
    variants: fullMotion,
  };
}

/**
 * Get transition config that respects reduced motion.
 * Use with `useReducedMotion()` hook.
 */
export function getTransition(
  reducedMotion: boolean,
  fullConfig: Transition
): Transition {
  if (reducedMotion) {
    return { duration: 0 };
  }
  return fullConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMON TRANSITION CONFIGS
// ─────────────────────────────────────────────────────────────────────────────

export const transitions = {
  // Standard entrance
  entrance: {
    duration: durations.normal,
    ease: easings.easeOutExpo,
  },
  // Fast micro-interaction
  micro: {
    duration: durations.fast,
    ease: easings.easeOut,
  },
  // Slow, cinematic
  cinematic: {
    duration: durations.cinematic,
    ease: easings.easeOutExpo,
  },
  // Spring (for bottom sheets, modals)
  spring: {
    type: 'spring',
    stiffness: 340,
    damping: 32,
  },
  // Gentle spring (for tooltips, popovers)
  springGentle: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
  },
  // Bouncy (for celebrations, success states)
  bouncy: {
    type: 'spring',
    stiffness: 400,
    damping: 17,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// VIEWPORT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const viewport = {
  once: true,
  margin: '-50px 0px -50px 0px',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// KEYFRAME ANIMATIONS (for CSS-in-JS or inline styles)
// ─────────────────────────────────────────────────────────────────────────────

export const keyframes = {
  /** Pulsing ring (recording, live indicator) */
  pulseRing: {
    '0%, 100%': { boxShadow: '0 0 0 0 var(--primary)' },
    '50%': { boxShadow: '0 0 0 8px transparent' },
  },
  /** Shimmer (skeleton loading) */
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  /** Spin (loading spinner) */
  spin: {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
  /** Bounce (notification badge) */
  bounce: {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-4px)' },
  },
  /** Wiggle (error shake) */
  wiggle: {
    '0%, 100%': { transform: 'rotate(0deg)' },
    '25%': { transform: 'rotate(-3deg)' },
    '75%': { transform: 'rotate(3deg)' },
  },
} as const;