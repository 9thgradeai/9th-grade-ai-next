import { describe, it, expect } from "vitest";
import { generateGalaxy, armTheta, BUCKET_COLORS, ARM_COUNT } from "@/components/landing/hero/GalaxyGenerator";
import { galaxyConfig, pickHeroQuality } from "@/components/landing/hero/GalaxyQuality";
import { hashSeed, mulberry32, expDiskSample } from "@/components/landing/hero/GalaxyRandom";
import { omegaAt, scrollStage, WeakSpotScheduler, LuminosityRider, gaussianFalloff } from "@/components/landing/hero/GalaxyMotion";

describe("GalaxyRandom", () => {
  it("produces deterministic values for the same seed", () => {
    const seed = 42;
    const a = mulberry32(seed);
    const b = mulberry32(seed);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("hashSeed is deterministic", () => {
    expect(hashSeed("9G-MILKYWAY-01")).toBe(hashSeed("9G-MILKYWAY-01"));
    expect(hashSeed("different")).not.toBe(hashSeed("9G-MILKYWAY-01"));
  });

  it("expDiskSample produces values in range", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const r = expDiskSample(rng, 0.3, 1.2);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1.2);
    }
  });
});

describe("GalaxyMotion", () => {
  it("omegaAt decreases with radius (differential rotation)", () => {
    const w1 = omegaAt(0.1);
    const w2 = omegaAt(0.5);
    const w3 = omegaAt(1.2);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
  });

  it("scrollStage returns 5 distinct stages with correct progress ranges", () => {
    const stages: string[] = [];
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const s = scrollStage(p);
      stages.push(s.stage);
      expect(s.progress).toBeGreaterThanOrEqual(0);
      expect(s.progress).toBeLessThanOrEqual(1);
      expect(s.activity).toBeGreaterThan(0.8);
    }
    expect(stages).toEqual(["discover", "analyze", "practice", "improve", "master"]);
  });

  it("gaussianFalloff decays with distance", () => {
    const r = 0.15;
    const c = gaussianFalloff(0, r);
    const e1 = gaussianFalloff(0.05, r);
    const e2 = gaussianFalloff(0.2, r);
    expect(c).toBe(1);
    expect(e1).toBeLessThan(1);
    expect(e2).toBeLessThan(e1);
  });

  it("WeakSpotScheduler produces events with irregular gaps", () => {
    const clusters = [{ r: 0.6, th0: 0.5, om: 0.02, isStarForming: true }];
    const sched = new WeakSpotScheduler(clusters, 12345);
    expect(sched.events.length).toBeGreaterThan(0);
    for (let i = 1; i < sched.events.length; i++) {
      const gap = sched.events[i].start - (sched.events[i - 1].start + sched.events[i - 1].dur);
      // First gap can be smaller due to initial offset, subsequent are 12-26s
      expect(gap).toBeGreaterThan(5000);
      expect(gap).toBeLessThan(35000);
    }
  });

  it("LuminosityRider spawn uses deterministic clock hash", () => {
    const rider = new LuminosityRider();
    const now = 10000;
    // same (now, seed) always gives same result
    const a = rider.spawn(now, 42, 1.0);
    const b = rider.spawn(now, 42, 1.0);
    expect(a).toBe(b);
  });
});

describe("GalaxyGenerator", () => {
  const seed = "9G-MILKYWAY-01";

  it("generateGalaxy is deterministic for the same seed and config", () => {
    const cfg = galaxyConfig("medium");
    const g1 = generateGalaxy(cfg, seed);
    const g2 = generateGalaxy(cfg, seed);
    expect(g1.count).toBe(g2.count);
    expect(g1.stars.length).toBe(g2.stars.length);
    // First few stars match exactly
    for (let i = 0; i < 10; i++) {
      const off = i * 12;
      expect(g1.stars[off]).toBeCloseTo(g2.stars[off], 6);
      expect(g1.stars[off + 1]).toBeCloseTo(g2.stars[off + 1], 6);
      expect(g1.stars[off + 10]).toBe(g2.stars[off + 10]); // bucket
    }
  });

  it("different seeds produce different galaxies", () => {
    const cfg = galaxyConfig("medium");
    const g1 = generateGalaxy(cfg, seed);
    const g2 = generateGalaxy(cfg, "different-seed");
    let diff = 0;
    for (let i = 0; i < Math.min(100, g1.count); i++) {
      if (g1.stars[i * 12] !== g2.stars[i * 12]) diff++;
    }
    expect(diff).toBeGreaterThan(50); // substantial difference
  });

  it("ultra tier has more stars than low tier", () => {
    const gLow = generateGalaxy(galaxyConfig("low"), seed);
    const gUltra = generateGalaxy(galaxyConfig("ultra"), seed);
    expect(gUltra.count).toBeGreaterThan(gLow.count);
  });

  it("luminous fraction is small (<15% including bright stars)", () => {
    const cfg = galaxyConfig("high");
    const g = generateGalaxy(cfg, seed);
    let glowCount = 0;
    for (let i = 0; i < g.count; i++) {
      if (g.stars[i * 12 + 11] === 1) glowCount++;
    }
    // Includes bright stars (~13%) + explicitly promoted luminous (~1.5%)
    expect(glowCount / g.count).toBeLessThan(0.15);
  });

  it("armTheta is monotonic in r for each arm", () => {
    for (let arm = 0; arm < ARM_COUNT; arm++) {
      let prev = -Infinity;
      for (let r = 0.5; r <= 1.2; r += 0.1) {
        const th = armTheta(r, arm);
        expect(th).toBeGreaterThan(prev);
        prev = th;
      }
    }
  });

  it("BUCKET_COUNT matches color array length", () => {
    expect(BUCKET_COLORS.length).toBe(15);
  });
});

describe("GalaxyQuality", () => {
  it("pickHeroQuality returns a valid tier", () => {
    const q = pickHeroQuality();
    expect(["ultra", "high", "medium", "low", "static"]).toContain(q);
  });

  it("quality config has all required fields", () => {
    for (const tier of ["ultra", "high", "medium", "low"] as const) {
      const cfg = galaxyConfig(tier);
      expect(cfg.starCount).toBeGreaterThan(0);
      expect(cfg.bgStarCount).toBeGreaterThan(0);
      expect(cfg.dustCount).toBeGreaterThanOrEqual(0);
      expect(cfg.nebulaCount).toBeGreaterThanOrEqual(0);
      expect(cfg.clusterCount).toBeGreaterThanOrEqual(0);
      expect(cfg.dprCap).toBeGreaterThan(0);
      expect(cfg.dustDetail).toBeGreaterThanOrEqual(0);
      expect(typeof cfg.motion).toBe("boolean");
    }
  });
});