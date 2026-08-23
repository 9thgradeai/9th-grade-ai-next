import {
  PERF_BUDGETS,
  QUALITY_ORDER,
  type HeroQuality,
} from "./config";

type AdaptiveLevel = Exclude<HeroQuality, "static">;

/**
 * Frame-time driven quality governor (spec §19).
 * Downgrades after sustained poor frames, upgrades only after a much
 * longer healthy stretch — hysteresis prevents visual oscillation.
 */
export class PerformanceManager {
  private levelIdx: number;
  private emaMs: number;
  private poorStreak = 0;
  private healthyStreak = 0;

  constructor(start: AdaptiveLevel) {
    this.levelIdx = QUALITY_ORDER.indexOf(start);
    if (this.levelIdx < 0) this.levelIdx = QUALITY_ORDER.length - 1;
    this.emaMs = 1000 / 60;
  }

  get level(): AdaptiveLevel {
    return QUALITY_ORDER[this.levelIdx];
  }

  get emaFrameMs(): number {
    return this.emaMs;
  }

  /** Report one rendered frame; returns the new level if it changed. */
  report(frameMs: number): AdaptiveLevel | null {
    this.emaMs = this.emaMs * 0.92 + Math.min(frameMs, 50) * 0.08;

    if (this.emaMs > PERF_BUDGETS.poorMs) {
      this.poorStreak += 1;
      this.healthyStreak = 0;
    } else if (this.emaMs < PERF_BUDGETS.healthyMs) {
      this.healthyStreak += 1;
      this.poorStreak = 0;
    } else {
      this.poorStreak = Math.max(0, this.poorStreak - 1);
      this.healthyStreak = Math.max(0, this.healthyStreak - 1);
    }

    const before = this.level;
    if (
      this.poorStreak >= PERF_BUDGETS.downgradeFrames &&
      this.levelIdx < QUALITY_ORDER.length - 1
    ) {
      this.levelIdx += 1;
      this.resetStreaks();
    } else if (
      this.healthyStreak >= PERF_BUDGETS.upgradeFrames &&
      this.levelIdx > 0
    ) {
      this.levelIdx -= 1;
      this.resetStreaks();
    }
    return this.level === before ? null : this.level;
  }

  private resetStreaks(): void {
    this.poorStreak = 0;
    this.healthyStreak = 0;
  }
}
