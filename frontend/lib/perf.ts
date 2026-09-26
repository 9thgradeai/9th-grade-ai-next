/**
 * Lightweight client performance instrumentation for the dashboard Home tab.
 *
 * Records named marks (mount → each scope resolving) and exposes them for
 * tests via `getEntries()`. In production the buffer is beaconed to
 * NEXT_PUBLIC_ANALYTICS_ENDPOINT when configured; otherwise entries stay
 * in-memory only. No PII is ever recorded — durations and scope names only.
 */

export type HomePerfScope = "pulse" | "tasks" | "analytics" | "full";

export type HomePerfEntry = {
  scope: HomePerfScope;
  /** ms from Home mount to this scope resolving */
  durationMs: number;
  /** whether this scope resolved from a fresh network fetch */
  fromNetwork: boolean;
  at: number;
};

const MAX_ENTRIES = 50;

class HomePerf {
  private startTime = 0;
  private entries: HomePerfEntry[] = [];

  /** Call once when Home mounts (or remounts on reload). */
  start() {
    this.startTime = Date.now();
  }

  /** Record a scope resolving. No-op when `start()` was never called. */
  record(scope: HomePerfScope, opts?: { fromNetwork?: boolean }) {
    if (this.startTime === 0) return;
    this.entries.push({
      scope,
      durationMs: Date.now() - this.startTime,
      fromNetwork: opts?.fromNetwork ?? true,
      at: Date.now(),
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.flush();
  }

  getEntries(): HomePerfEntry[] {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
    this.startTime = 0;
  }

  private flush() {
    // eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
    const endpoint = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT : undefined;
    if (!endpoint) return;
    try {
      const body = JSON.stringify({ event: "home_perf", data: this.entries.at(-1) });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(endpoint, body);
      } else {
        void fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      /* instrumentation must never break the dashboard */
    }
  }
}

export const homePerf = new HomePerf();
