import { describe, expect, it } from "vitest";
import {
  xpForSolved,
  levelForXp,
  leagueForScore,
  freezeEarned,
  freezeAvailable,
  rankAmbientCards,
} from "@/lib/gamification";

describe("gamification engine (Phase 1)", () => {
  it("computes XP from solved + accuracy", () => {
    expect(xpForSolved(0, 0)).toBe(0);
    expect(xpForSolved(100, 80)).toBeGreaterThan(xpForSolved(100, 40));
  });

  it("levels up monotonically", () => {
    const l1 = levelForXp(0);
    const l2 = levelForXp(500);
    expect(l1.level).toBe(1);
    expect(l2.level).toBeGreaterThan(1);
    expect(l2.intoLevel).toBeLessThan(l2.forNext);
  });

  it("maps score to league tiers", () => {
    expect(leagueForScore(10)).toBe("Bronze");
    expect(leagueForScore(40)).toBe("Silver");
    expect(leagueForScore(60)).toBe("Gold");
    expect(leagueForScore(75)).toBe("Diamond");
    expect(leagueForScore(90)).toBe("Elite");
  });

  it("earns freeze at milestones", () => {
    expect(freezeEarned(0)).toBe(0);
    expect(freezeEarned(3)).toBe(1);
    expect(freezeEarned(30)).toBe(2);
    expect(freezeAvailable(7, 0)).toBe(true);
    expect(freezeAvailable(7, 1)).toBe(false);
  });

  it("ranks mistakes first when unmastered exist", () => {
    const ranked = rankAmbientCards({ unmasteredMistakes: 5, flashcardsDue: 0 });
    expect(ranked[0]).toBe("mission");
  });
});
