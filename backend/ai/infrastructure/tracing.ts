// AI request tracing — lightweight span-based tracing for every AI call.
// No external dependencies; uses structured log events that can be correlated
// via a shared requestId. Designed for production observability without
// imposing overhead on the hot path.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

// ── Types ──────────────────────────────────────────────────

export type SpanStatus = "ok" | "error" | "timeout" | "cancelled";

export type SpanEvent = {
  name: string;
  timestampMs: number;
  durationMs?: number;
  status: SpanStatus;
  metadata?: Record<string, unknown>;
};

export type TraceSpan = {
  traceId: string;
  spanId: string;
  name: string;
  startMs: number;
  endMs?: number;
  status: SpanStatus;
  parentSpanId?: string;
  events: SpanEvent[];
  metadata: Record<string, unknown>;
};

export type TraceContext = {
  traceId: string;
  spanId: string;
  /** Start a child span within this trace. */
  childSpan(name: string, metadata?: Record<string, unknown>): TraceSpan;
  /** Record a named event within the current span. */
  event(name: string, status?: SpanStatus, metadata?: Record<string, unknown>): void;
  /** Finish the current span and log it. */
  finish(status?: SpanStatus, metadata?: Record<string, unknown>): void;
  /** Get elapsed ms since trace start. */
  elapsedMs(): number;
};

// ── ID generation ──────────────────────────────────────────

let counter = 0;

function generateId(): string {
  counter = (counter + 1) % 1_000_000;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}-${counter}`;
}

// ── Span implementation ────────────────────────────────────

function createSpan(
  traceId: string,
  name: string,
  parentSpanId?: string,
  metadata?: Record<string, unknown>,
): TraceSpan {
  return {
    traceId,
    spanId: generateId(),
    name,
    startMs: Date.now(),
    status: "ok",
    parentSpanId,
    events: [],
    metadata: metadata ?? {},
  };
}

function finishSpan(span: TraceSpan, status?: SpanStatus, metadata?: Record<string, unknown>): void {
  span.endMs = Date.now();
  if (status) span.status = status;
  if (metadata) Object.assign(span.metadata, metadata);

  const durationMs = span.endMs - span.startMs;

  log.info("ai.trace.span", {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    durationMs,
    status: span.status,
    eventCount: span.events.length,
    ...span.metadata,
  });
}

// ── Trace context factory ──────────────────────────────────

export function createTraceContext(
  name: string,
  metadata?: Record<string, unknown>,
): TraceContext {
  const traceId = generateId();
  const rootSpan = createSpan(traceId, name, undefined, metadata);

  let activeSpan = rootSpan;

  const ctx: TraceContext = {
    traceId,
    spanId: rootSpan.spanId,

    childSpan(childName: string, childMetadata?: Record<string, unknown>): TraceSpan {
      const span = createSpan(traceId, childName, activeSpan.spanId, childMetadata);
      activeSpan.events.push({
        name: `child:${childName}`,
        timestampMs: span.startMs,
        status: "ok",
      });
      return span;
    },

    event(eventName: string, status: SpanStatus = "ok", eventMetadata?: Record<string, unknown>): void {
      activeSpan.events.push({
        name: eventName,
        timestampMs: Date.now(),
        status,
        metadata: eventMetadata,
      });
    },

    finish(status?: SpanStatus, finishMetadata?: Record<string, unknown>): void {
      finishSpan(activeSpan, status, finishMetadata);
    },

    elapsedMs(): number {
      return Date.now() - rootSpan.startMs;
    },
  };

  return ctx;
}

// ── Convenience: wrap an async operation in a traced span ──

export async function traced<T>(
  trace: TraceContext,
  spanName: string,
  fn: (span: TraceSpan) => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const span = trace.childSpan(spanName, metadata);
  try {
    const result = await fn(span);
    finishSpan(span, "ok");
    return result;
  } catch (err) {
    finishSpan(span, "error", {
      error: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

// ── Timer utility for manual span timing ───────────────────

export function startTimer(): { elapsedMs: () => number; stop: () => number } {
  const start = performance.now();
  return {
    elapsedMs: () => Math.round(performance.now() - start),
    stop: () => Math.round(performance.now() - start),
  };
}
