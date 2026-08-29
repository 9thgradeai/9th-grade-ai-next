// backend/infrastructure/observability/logger.ts
// Structured logging using Pino. Emits single-line JSON in production,
// human-readable one-liners in development.

import "server-only";

import pino from "pino";
import type { LogFields } from "./types";

const SENSITIVE_KEY_RE = /(password|passwd|secret|token|authorization|cookie|apikey|api_key)/i;

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

// Create Pino logger with appropriate transport
function createLogger() {
  const isProd = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  if (isTest) {
    // No-op logger for tests
    return {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => createLogger(),
    };
  }

  const config: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
    redact: {
      paths: ["*.password*", "*.passwd*", "*.secret*", "*.token*", "*.authorization*", "*.cookie*", "*.apikey*", "*.api_key*"],
      censor: "[REDACTED]",
    },
    base: {
      service: "9th-grade-ai",
      env: process.env.NODE_ENV ?? "development",
      vercel_env: process.env.VERCEL_ENV,
    },
  };

  if (isProd) {
    // Production: JSON output to stdout
    return pino(config);
  } else {
    // Development: pretty print
    return pino({
      ...config,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  }
}

const pinoLogger = createLogger();

export const log = {
  info: (event: string, fields?: LogFields) => {
    pinoLogger.info(redact(fields ?? {}), event);
  },
  warn: (event: string, fields?: LogFields) => {
    pinoLogger.warn(redact(fields ?? {}), event);
  },
  error: (event: string, fields?: LogFields) => {
    pinoLogger.error(redact(fields ?? {}), event);
  },
  debug: (event: string, fields?: LogFields) => {
    pinoLogger.debug(redact(fields ?? {}), event);
  },
  child: (bindings: LogFields) => {
    const child = pinoLogger.child(redact(bindings));
    return {
      info: (event: string, fields?: LogFields) => child.info(redact(fields ?? {}), event),
      warn: (event: string, fields?: LogFields) => child.warn(redact(fields ?? {}), event),
      error: (event: string, fields?: LogFields) => child.error(redact(fields ?? {}), event),
      debug: (event: string, fields?: LogFields) => child.debug(redact(fields ?? {}), event),
    };
  },
};

/** Test-only passthrough so the redaction contract is verifiable in unit tests. */
export function __redactFieldsForTest(fields: LogFields): LogFields {
  return redact(fields);
}