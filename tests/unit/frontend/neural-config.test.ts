import { describe, it, expect } from "vitest";
import {
  QUALITY_PRESETS,
  QUALITY_ORDER,
  TIER_START_QUALITY,
  TIER_GEOMETRY,
  PERF_BUDGETS,
  ACTIVATION,
  resolveConfig,
} from "@/components/visual/neural/config";

describe("neural config", () => {
  it("orders quality levels from ultra to low", () => {
    expect(QUALITY_ORDER).toEqual(["ultra", "high", "medium", "low"]);
  });

  it("strictly reduces budgets as quality decreases", () => {
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      const richer = QUALITY_PRESETS[QUALITY_ORDER[i - 1]];
      const poorer = QUALITY_PRESETS[QUALITY_ORDER[i]];
      expect(poorer.mg).toBeLessThan(richer.mg);
      expect(poorer.particles).toBeLessThan(richer.particles);
      expect(poorer.maxDpr).toBeLessThanOrEqual(richer.maxDpr);
    }
  });

  it("caps DPR at 2 and keeps positive counts everywhere", () => {
    for (const key of QUALITY_ORDER) {
      const p = QUALITY_PRESETS[key];
      expect(p.maxDpr).toBeLessThanOrEqual(2);
      expect(p.mg).toBeGreaterThan(0);
      expect(p.bg).toBeGreaterThanOrEqual(0);
      expect(p.fg).toBeGreaterThanOrEqual(0);
      expect(p.particles).toBeGreaterThan(0);
      expect(p.ambient).toBeGreaterThan(0);
    }
  });

  it("maps every device tier to a valid non-static starting quality", () => {
    for (const tier of ["desktop", "tablet", "mobile"] as const) {
      expect(QUALITY_ORDER).toContain(TIER_START_QUALITY[tier]);
      const cfg = resolveConfig(tier, TIER_START_QUALITY[tier]);
      expect(cfg).not.toBeNull();
      expect(cfg?.geometry).toEqual(TIER_GEOMETRY[tier]);
    }
  });

  it("returns null config only for static quality", () => {
    expect(resolveConfig("desktop", "static")).toBeNull();
  });

  it("keeps governor budgets hysteresis-shaped", () => {
    expect(PERF_BUDGETS.poorMs).toBeGreaterThan(PERF_BUDGETS.healthyMs);
    expect(PERF_BUDGETS.upgradeFrames).toBeGreaterThan(PERF_BUDGETS.downgradeFrames);
  });

  it("bounds activation system resources", () => {
    expect(ACTIVATION.maxPulses).toBeLessThanOrEqual(6);
    expect(ACTIVATION.maxDissolves).toBeLessThanOrEqual(4);
    expect(ACTIVATION.maxTravelers).toBeLessThanOrEqual(12);
    expect(ACTIVATION.eventGapMin).toBeGreaterThan(1.5);
  });
});
