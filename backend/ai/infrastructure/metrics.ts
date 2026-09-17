// AI metrics collection — in-process counters, histograms, and gauges.
// Designed for production observability without external dependencies.
// Metrics are periodically flushed to structured logs and can be queried
// via the usage/summary endpoint.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

// ── Types ──────────────────────────────────────────────────

export type MetricType = "counter" | "histogram" | "gauge";

export type MetricEntry = {
  name: string;
  type: MetricType;
  value: number;
  count?: number; // for histogram: number of observations
  labels?: Record<string, string>;
  lastUpdateMs: number;
};

// ── In-process metric store ────────────────────────────────

const metrics = new Map<string, MetricEntry>();

function metricKey(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const sorted = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${sorted}}`;
}

// ── Counter ────────────────────────────────────────────────

export function incrementCounter(
  name: string,
  value = 1,
  labels?: Record<string, string>,
): void {
  const key = metricKey(name, labels);
  const existing = metrics.get(key);
  if (existing && existing.type === "counter") {
    existing.value += value;
    existing.lastUpdateMs = Date.now();
  } else {
    metrics.set(key, {
      name,
      type: "counter",
      value,
      labels,
      lastUpdateMs: Date.now(),
    });
  }
}

// ── Histogram ──────────────────────────────────────────────

export function recordHistogram(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  const key = metricKey(name, labels);
  const existing = metrics.get(key);
  if (existing && existing.type === "histogram") {
    // Running average for memory efficiency
    existing.count = (existing.count ?? 0) + 1;
    existing.value = existing.value + (value - existing.value) / existing.count;
    existing.lastUpdateMs = Date.now();
  } else {
    metrics.set(key, {
      name,
      type: "histogram",
      value,
      count: 1,
      labels,
      lastUpdateMs: Date.now(),
    });
  }
}

// ── Gauge ──────────────────────────────────────────────────

export function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  const key = metricKey(name, labels);
  const existing = metrics.get(key);
  if (existing) {
    existing.value = value;
    existing.lastUpdateMs = Date.now();
  } else {
    metrics.set(key, {
      name,
      type: "gauge",
      value,
      labels,
      lastUpdateMs: Date.now(),
    });
  }
}

// ── Query ──────────────────────────────────────────────────

export function getMetric(name: string, labels?: Record<string, string>): MetricEntry | undefined {
  return metrics.get(metricKey(name, labels));
}

export function getAllMetrics(): MetricEntry[] {
  return Array.from(metrics.values());
}

export function getMetricsByPrefix(prefix: string): MetricEntry[] {
  return Array.from(metrics.values()).filter((m) => m.name.startsWith(prefix));
}

// ── Flush to logs ──────────────────────────────────────────

export function flushMetrics(): void {
  const entries = Array.from(metrics.values());
  if (entries.length === 0) return;

  log.info("ai.metrics.flush", {
    count: entries.length,
    counters: entries.filter((e) => e.type === "counter").length,
    histograms: entries.filter((e) => e.type === "histogram").length,
    gauges: entries.filter((e) => e.type === "gauge").length,
  });

  // Log individual metrics at debug level for detailed analysis
  for (const entry of entries) {
    log.debug("ai.metrics.item", {
      name: entry.name,
      type: entry.type,
      value: entry.value,
      count: entry.count,
      labels: entry.labels,
      age: Date.now() - entry.lastUpdateMs,
    });
  }
}

// ── Reset (for tests) ─────────────────────────────────────

export function resetMetrics(): void {
  metrics.clear();
}

// ── Convenience helpers for common AI metrics ──────────────

export function recordAiRequest(
  task: string,
  provider: string,
  model: string,
  latencyMs: number,
  success: boolean,
  inputTokens: number,
  outputTokens: number,
  estimatedCostUsd: number,
): void {
  const labels = { task, provider, model };

  incrementCounter("ai.requests.total", 1, labels);
  if (success) {
    incrementCounter("ai.requests.success", 1, labels);
  } else {
    incrementCounter("ai.requests.error", 1, labels);
  }

  recordHistogram("ai.latency.ms", latencyMs, labels);
  recordHistogram("ai.tokens.input", inputTokens, labels);
  recordHistogram("ai.tokens.output", outputTokens, labels);
  recordHistogram("ai.cost.usd", estimatedCostUsd, labels);
}

export function recordToolExecution(
  toolName: string,
  durationMs: number,
  success: boolean,
): void {
  const labels = { tool: toolName };

  incrementCounter("ai.tool.calls", 1, labels);
  if (success) {
    incrementCounter("ai.tool.success", 1, labels);
  } else {
    incrementCounter("ai.tool.error", 1, labels);
  }
  recordHistogram("ai.tool.latency.ms", durationMs, labels);
}

export function recordAgentStep(
  provider: string,
  stepNumber: number,
  hadToolCall: boolean,
): void {
  const labels = { provider };

  incrementCounter("ai.agent.steps", 1, labels);
  if (hadToolCall) {
    incrementCounter("ai.agent.tool_calls", 1, labels);
  }
  setGauge("ai.agent.current_step", stepNumber, labels);
}

export function recordProviderFailover(
  fromProvider: string,
  toProvider: string,
  reason: string,
): void {
  incrementCounter("ai.provider.failover", 1, { from: fromProvider, to: toProvider, reason });
}

export function recordCacheHit(cacheType: string, hit: boolean): void {
  incrementCounter(`ai.cache.${cacheType}`, 1, { hit: String(hit) });
}

export function recordRetrieval(
  method: string,
  resultCount: number,
  latencyMs: number,
): void {
  const labels = { method };
  recordHistogram("ai.retrieval.results", resultCount, labels);
  recordHistogram("ai.retrieval.latency.ms", latencyMs, labels);
}
