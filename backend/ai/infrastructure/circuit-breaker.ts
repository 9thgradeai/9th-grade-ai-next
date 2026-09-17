// Circuit breaker — prevents cascading failures when a provider is unhealthy.
// States: CLOSED (normal) → OPEN (failing, reject immediately) → HALF_OPEN (test).
// Configurable thresholds per provider.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

// ── Types ──────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  /** Number of consecutive failures before opening the circuit. */
  failureThreshold: number;
  /** Ms to wait before trying again (open → half_open). */
  resetTimeoutMs: number;
  /** Number of successful calls in half_open before closing. */
  halfOpenSuccessThreshold: number;
};

export const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30_000, // 30 seconds
  halfOpenSuccessThreshold: 1,
};

// ── Circuit breaker implementation ─────────────────────────

type CircuitRecord = {
  state: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  lastFailureMs: number;
  lastStateChangeMs: number;
};

const circuits = new Map<string, CircuitRecord>();

function getRecord(name: string): CircuitRecord {
  let rec = circuits.get(name);
  if (!rec) {
    rec = {
      state: "closed",
      consecutiveFailures: 0,
      halfOpenSuccesses: 0,
      lastFailureMs: 0,
      lastStateChangeMs: Date.now(),
    };
    circuits.set(name, rec);
  }
  return rec;
}

/**
 * Check if a provider is allowed to handle a request.
 * Returns true if the circuit is closed or half_open.
 * Returns false if the circuit is open (provider is failing).
 */
export function isCircuitClosed(name: string, config: CircuitBreakerConfig = DEFAULT_CONFIG): boolean {
  const rec = getRecord(name);

  if (rec.state === "closed") return true;

  if (rec.state === "open") {
    // Check if reset timeout has elapsed → transition to half_open
    if (Date.now() - rec.lastFailureMs >= config.resetTimeoutMs) {
      rec.state = "half_open";
      rec.halfOpenSuccesses = 0;
      rec.lastStateChangeMs = Date.now();
      log.info("ai.circuit.half_open", { provider: name });
      return true; // Allow one test request
    }
    return false;
  }

  // half_open: allow requests
  return true;
}

/**
 * Record a successful call. Transitions half_open → closed when enough
 * successes accumulate.
 */
export function recordSuccess(
  name: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
): void {
  const rec = getRecord(name);

  if (rec.state === "half_open") {
    rec.halfOpenSuccesses += 1;
    if (rec.halfOpenSuccesses >= config.halfOpenSuccessThreshold) {
      rec.state = "closed";
      rec.consecutiveFailures = 0;
      rec.halfOpenSuccesses = 0;
      rec.lastStateChangeMs = Date.now();
      log.info("ai.circuit.closed", { provider: name });
    }
  } else if (rec.state === "closed") {
    rec.consecutiveFailures = 0;
  }
}

/**
 * Record a failed call. Transitions closed → open when failure threshold
 * is exceeded.
 */
export function recordFailure(
  name: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
): void {
  const rec = getRecord(name);
  rec.lastFailureMs = Date.now();

  if (rec.state === "half_open") {
    // Single failure in half_open → back to open
    rec.state = "open";
    rec.halfOpenSuccesses = 0;
    rec.lastStateChangeMs = Date.now();
    log.warn("ai.circuit.reopen", { provider: name, reason: "half_open_failure" });
    return;
  }

  rec.consecutiveFailures += 1;
  if (rec.consecutiveFailures >= config.failureThreshold) {
    rec.state = "open";
    rec.lastStateChangeMs = Date.now();
    log.warn("ai.circuit.open", {
      provider: name,
      consecutiveFailures: rec.consecutiveFailures,
    });
  }
}

/**
 * Force-reset a circuit to closed (e.g., after manual intervention).
 */
export function resetCircuit(name: string): void {
  const rec = getRecord(name);
  rec.state = "closed";
  rec.consecutiveFailures = 0;
  rec.halfOpenSuccesses = 0;
  rec.lastStateChangeMs = Date.now();
  log.info("ai.circuit.reset", { provider: name });
}

/**
 * Get current circuit state for a provider (for observability).
 */
export function getCircuitState(name: string): CircuitRecord {
  return { ...getRecord(name) };
}

/**
 * Get all circuit states (for observability dashboard).
 */
export function getAllCircuitStates(): Record<string, CircuitRecord> {
  const result: Record<string, CircuitRecord> = {};
  for (const [name, rec] of circuits) {
    result[name] = { ...rec };
  }
  return result;
}
