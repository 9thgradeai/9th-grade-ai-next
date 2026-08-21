// backend/infrastructure/observability/logger.ts
// Structured logging (Phase 18). Emits single-line JSON when LOG_FORMAT=json
// or in production; human-readable one-liners otherwise.
//
// REDACTION CONTRACT: values whose keys match the sensitive list are replaced
// with "[REDACTED]" before serialization. Never log raw credentials — pass
// identifiers, not secrets.

import "server-only";

type LogFields = Record<string, unknown>;

const SENSITIVE_KEY_RE =
  /(password|passwd|secret|token|authorization|cookie|apikey|api_key)/i;

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

function shouldUseJson(): boolean {
  return process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production";
}

function write(level: "info" | "warn" | "error", event: string, fields: LogFields = {}): void {
  if (process.env.NODE_ENV === "test") return; // keep test output clean
  const safe = redact(fields);
  if (shouldUseJson()) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }
  const flat = Object.entries(safe)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  const line = `[${level.toUpperCase()}] ${event}${flat ? " " + flat : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

/** Test-only passthrough so the redaction contract is verifiable in unit tests. */
export function __redactFieldsForTest(fields: LogFields): LogFields {
  return redact(fields);
}
