import { describe, it, expect } from "vitest";
import { PerformanceManager } from "@/components/visual/neural/performance-manager";
import { PERF_BUDGETS } from "@/components/visual/neural/config";

describe("PerformanceManager", () => {
  it("starts at the requested level", () => {
    const pm = new PerformanceManager("high");
    expect(pm.level).toBe("high");
  });

  it("downgrades exactly one level after sustained poor frames", () => {
    const pm = new PerformanceManager("ultra");
    let last: string | null = null;
    for (let i = 0; i < PERF_BUDGETS.downgradeFrames + 20; i++) {
      const change = pm.report(60);
      if (change) last = change;
    }
    expect(last).toBe("high");
    expect(pm.level).toBe("high");
  });

  it("never downgrades below low", () => {
    const pm = new PerformanceManager("low");
    for (let i = 0; i < PERF_BUDGETS.downgradeFrames * 3; i++) pm.report(80);
    expect(pm.level).toBe("low");
  });

  it("upgrades after a sustained healthy period", () => {
    const pm = new PerformanceManager("medium");
    // EMA starts at 60fps baseline and needs ~15 frames to fall under the
    // healthy threshold before the upgrade streak begins counting.
    for (let i = 0; i < PERF_BUDGETS.upgradeFrames + 50; i++) pm.report(2);
    expect(pm.level).toBe("high");
  });

  it("does not oscillate on borderline frame times", () => {
    const pm = new PerformanceManager("medium");
    for (let i = 0; i < PERF_BUDGETS.upgradeFrames * 2; i++) pm.report(10);
    expect(pm.level).toBe("medium");
  });

  it("requires renewed pressure after each step (hysteresis)", () => {
    const pm = new PerformanceManager("ultra");
    // first downgrade
    for (let i = 0; i < PERF_BUDGETS.downgradeFrames + 5; i++) pm.report(60);
    expect(pm.level).toBe("high");
    // brief recovery resets the streak — next burst must start over
    for (let i = 0; i < 40; i++) pm.report(2);
    for (let i = 0; i < PERF_BUDGETS.downgradeFrames - 10; i++) pm.report(60);
    expect(pm.level).toBe("high");
  });
});
