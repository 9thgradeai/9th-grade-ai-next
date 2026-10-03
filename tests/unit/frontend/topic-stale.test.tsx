import { describe, it, expect } from "vitest";
import { daysSince, isTopicStale } from "@/components/dashboard/command-center/SubjectMasteryMatrix";

const NOW = new Date("2026-10-03T12:00:00Z").getTime();

describe("forgetting-risk flags (O9)", () => {
  it("daysSince counts whole days and tolerates bad input", () => {
    expect(daysSince("2026-10-03T00:00:00Z", NOW)).toBe(0);
    expect(daysSince("2026-09-19T12:00:00Z", NOW)).toBe(14);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince("not-a-date", NOW)).toBeNull();
  });

  it("flags topics untouched for 14+ days as stale", () => {
    expect(isTopicStale("2026-09-19T12:00:00Z", NOW)).toBe(true);
    expect(isTopicStale("2026-09-20T12:00:00Z", NOW)).toBe(false);
    expect(isTopicStale("2026-10-03T12:00:00Z", NOW)).toBe(false);
    expect(isTopicStale(null, NOW)).toBe(false);
  });
});
