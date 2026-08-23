import { describe, it, expect } from "vitest";
import { generateNetwork } from "@/components/visual/neural/neuralGenerator";
import { resolveConfig } from "@/components/visual/neural/config";

describe("neuralGenerator", () => {
  it("is deterministic for a fixed config + seed", () => {
    const cfg = resolveConfig("desktop", "ultra")!;
    const a = generateNetwork(cfg);
    const b = generateNetwork(cfg);
    expect(a.segs.length).toBe(b.segs.length);
    expect(a.neurons.length).toBe(b.neurons.length);
    expect(a.hubIndex).toBe(b.hubIndex);
    expect(a.particles.length).toBe(b.particles.length);
    expect(a.paths.length).toBe(b.paths.length);
  });

  it("matches preset budgets exactly", () => {
    const cfg = resolveConfig("desktop", "ultra")!;
    const net = generateNetwork(cfg);
    expect(net.neurons.length).toBe(cfg.preset.mg + cfg.preset.bg + cfg.preset.fg);
    expect(net.particles.length).toBe(cfg.preset.particles);
    expect(net.ambient.length).toBe(cfg.preset.ambient);
  });

  it("keeps structured layers out of the content-safe zone on desktop", () => {
    const cfg = resolveConfig("desktop", "ultra")!;
    const net = generateNetwork(cfg);
    const minX = cfg.geometry.centerX - cfg.geometry.spreadX * 0.38;
    for (const n of net.neurons) {
      if (n.layer === 2) continue;
      expect(n.pos[0]).toBeGreaterThanOrEqual(minX - 1e-9);
    }
  });

  it("records connection paths within the configured cap and valid indices", () => {
    const cfg = resolveConfig("desktop", "ultra")!;
    const net = generateNetwork(cfg);
    expect(net.paths.length).toBeLessThanOrEqual(64);
    expect(net.pathLookup.size).toBe(net.paths.length);
    for (const p of net.paths) {
      expect(p.ia).toBeLessThan(net.neurons.length);
      expect(p.ib).toBeLessThan(net.neurons.length);
    }
  });

  it("scales density down on the mobile tier", () => {
    const desktop = generateNetwork(resolveConfig("desktop", "ultra")!);
    const mobile = generateNetwork(resolveConfig("mobile", "medium")!);
    expect(mobile.segs.length).toBeLessThan(desktop.segs.length);
    expect(mobile.particles.length).toBeLessThan(desktop.particles.length);
  });

  it("keeps ambient motes dimmer than neural fragments", () => {
    const net = generateNetwork(resolveConfig("tablet", "high")!);
    const avgDim = (arr: { dim: number }[]) =>
      arr.reduce((s, p) => s + p.dim, 0) / arr.length;
    expect(avgDim(net.ambient)).toBeLessThan(avgDim(net.particles));
  });
});
