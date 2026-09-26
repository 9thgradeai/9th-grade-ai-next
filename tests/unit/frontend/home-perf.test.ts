import { describe, it, expect, beforeEach } from "vitest";
import { homePerf } from "@/lib/perf";

describe("homePerf instrumentation", () => {
  beforeEach(() => homePerf.clear());

  it("records nothing before start() is called", () => {
    homePerf.record("pulse");
    expect(homePerf.getEntries()).toHaveLength(0);
  });

  it("records per-scope durations after start()", () => {
    homePerf.start();
    homePerf.record("pulse");
    homePerf.record("analytics", { fromNetwork: false });
    const entries = homePerf.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].scope).toBe("pulse");
    expect(entries[0].fromNetwork).toBe(true);
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(entries[1].scope).toBe("analytics");
    expect(entries[1].fromNetwork).toBe(false);
  });

  it("caps the buffer so long sessions cannot leak memory", () => {
    homePerf.start();
    for (let i = 0; i < 80; i++) homePerf.record("pulse");
    expect(homePerf.getEntries().length).toBeLessThanOrEqual(50);
  });

  it("never throws when the analytics endpoint is missing", () => {
    homePerf.start();
    expect(() => homePerf.record("tasks")).not.toThrow();
  });
});
