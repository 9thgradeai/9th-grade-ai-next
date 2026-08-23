import type { SceneTier } from "./neuralGenerator";

/**
 * Centralized neural-hero configuration (spec §28).
 * All visual tuning happens here — no magic numbers in renderer code.
 */

export type HeroQuality = "ultra" | "high" | "medium" | "low" | "static";

export interface QualityPreset {
  /** mid-layer neuron budget (primary visible cells) */
  mg: number;
  /** background depth-layer neurons */
  bg: number;
  /** large foreground neurons */
  fg: number;
  /** fiber connections attached to each node (max) */
  maxConn: number;
  /** connection search radius */
  connDist: number;
  /** cellular fragment particles bound to neurons */
  particles: number;
  /** free-drifting environmental particles (subtle depth cue) */
  ambient: number;
  /** device-pixel-ratio ceiling */
  maxDpr: number;
  /** resolution scale multiplier applied by adaptive governor */
  resScale: number;
  /** line width multiplier */
  widthScale: number;
}

const PRESETS: Record<Exclude<HeroQuality, "static">, QualityPreset> = {
  ultra: {
    mg: 132, bg: 40, fg: 16, maxConn: 3, connDist: 0.125,
    particles: 620, ambient: 90, maxDpr: 1.75, resScale: 1, widthScale: 1.35,
  },
  high: {
    mg: 104, bg: 32, fg: 13, maxConn: 3, connDist: 0.13,
    particles: 480, ambient: 64, maxDpr: 1.5, resScale: 0.92, widthScale: 1.25,
  },
  medium: {
    mg: 80, bg: 24, fg: 10, maxConn: 2, connDist: 0.135,
    particles: 360, ambient: 44, maxDpr: 1.25, resScale: 0.82, widthScale: 1.15,
  },
  low: {
    mg: 56, bg: 16, fg: 8, maxConn: 2, connDist: 0.15,
    particles: 240, ambient: 26, maxDpr: 1, resScale: 0.72, widthScale: 1,
  },
};

export const QUALITY_PRESETS = PRESETS;

export const QUALITY_ORDER: Exclude<HeroQuality, "static">[] = [
  "ultra",
  "high",
  "medium",
  "low",
];

/** Starting quality per detected device tier (spec §19/§20). */
export const TIER_START_QUALITY: Record<SceneTier, Exclude<HeroQuality, "static">> = {
  desktop: "ultra",
  tablet: "high",
  mobile: "medium",
};

/** Per-tier world-space composition. */
export interface TierGeometry {
  centerX: number;
  centerY: number;
  spreadX: number;
  spreadY: number;
  spreadZ: number;
}

export const TIER_GEOMETRY: Record<SceneTier, TierGeometry> = {
  desktop: { centerX: 0.6, centerY: 0.04, spreadX: 0.5, spreadY: 0.44, spreadZ: 0.34 },
  tablet: { centerX: 0.5, centerY: 0.06, spreadX: 0.4, spreadY: 0.4, spreadZ: 0.32 },
  mobile: { centerX: 0.02, centerY: 0.1, spreadX: 0.26, spreadY: 0.34, spreadZ: 0.28 },
};

/**
 * Content-safe region (spec §4): horizontal world-space band the cluster
 * must stay out of, expressed as the fraction of half-width reserved for
 * hero copy measured from the left edge of the cluster's field.
 */
export const CONTENT_SAFE_LEFT_FRACTION: Record<SceneTier, number> = {
  desktop: 0.18,
  tablet: 0.08,
  mobile: 0,
};

/** Frame-time budgets driving the adaptive governor (ms). */
export const PERF_BUDGETS = {
  /** EMA above this for DOWNGRADE_FRAMES → step down */
  poorMs: 14,
  /** EMA below this for UPGRADE_FRAMES → step up */
  healthyMs: 7.5,
  downgradeFrames: 110,
  upgradeFrames: 340,
} as const;

/** Activation choreography (seconds). */
export const ACTIVATION = {
  conductionSpeed: 0.24,
  actDecayTau: 1.7,
  maxPulses: 6,
  maxDissolves: 4,
  maxTravelers: 8,
  maxConnectionPaths: 64,
  eventGapMin: 4,
  eventGapVar: 4,
  introGlowStart: 3.1,
  introFireAt: 3.95,
  directorStart: 6.4,
} as const;

/** Restrained palette (spec §33): blue/violet field, teal accent,
 *  warm amber reserved exclusively for active energy moments. */
export const PALETTE_DOC = {
  field: "restrained blue ↔ violet ↔ teal (see hueFamily in shaders.ts)",
  activationWarm: "vec3(1.00, 0.74, 0.42) — travelers + intro ignition only",
} as const;

/** Fully-resolved configuration handed to the generator/renderer. */
export interface ResolvedNeuralConfig {
  tier: SceneTier;
  quality: Exclude<HeroQuality, "static">;
  preset: QualityPreset;
  geometry: TierGeometry;
}

export function resolveConfig(tier: SceneTier, quality: HeroQuality): ResolvedNeuralConfig | null {
  if (quality === "static") return null;
  return {
    tier,
    quality,
    preset: PRESETS[quality],
    geometry: TIER_GEOMETRY[tier],
  };
}
