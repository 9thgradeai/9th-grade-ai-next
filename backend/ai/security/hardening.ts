// Security hardening — prompt injection detection, input sanitization,
// rate limiting for write operations, and audit logging.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";
import { ValidationError } from "~backend/errors";

/** Prompt injection patterns to detect. */
const INJECTION_PATTERNS = [
  // English patterns
  /ignore\s+(previous|all|above)\s+instructions?/i,
  /you\s+are\s+now\s+(a|an|the)\s+\w+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /HUMAN:/i,
  /ASSISTANT:/i,
  // Bengali patterns
  /আগের\s+নির্দেশনা\s+উপেক্ষা\s+করুন/i,
  /সমস্ত\s+নির্দেশনা\s+ভুলে\s+যান/i,
  /এখন\s+আপনি\s+\w+\s+আছেন/i,
  // Common jailbreak attempts
  /DAN\s+mode/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /bypass\s+(safety|filter|content)/i,
  /ignore\s+(safety|content|filter)/i,
];

/** Suspicious content patterns. */
const SUSPICIOUS_PATTERNS = [
  /https?:\/\/[^\s]+/gi, // URLs (might be phishing)
  /<script[\s>]/gi, // Script tags
  /javascript:/gi, // JavaScript protocol
  /on\w+\s*=/gi, // Event handlers
  /eval\s*\(/i, // eval calls
  /document\.(cookie|write)/i, // DOM manipulation
  /localStorage/i, // Local storage access
  /sessionStorage/i, // Session storage access
];

export type InjectionDetection = {
  /** Whether injection was detected. */
  detected: boolean;
  /** List of detected patterns. */
  patterns: string[];
  /** Risk level. */
  riskLevel: "low" | "medium" | "high";
  /** Sanitized input (if safe to proceed). */
  sanitizedInput?: string;
};

/**
 * Detect prompt injection attempts in user input.
 */
export function detectPromptInjection(input: string): InjectionDetection {
  const detectedPatterns: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source);
    }
  }

  if (detectedPatterns.length === 0) {
    return { detected: false, patterns: [], riskLevel: "low" };
  }

  const riskLevel = detectedPatterns.length >= 3 ? "high" : detectedPatterns.length >= 2 ? "medium" : "low";

  log.warn("Prompt injection detected", {
    patterns: detectedPatterns,
    riskLevel,
    inputLength: input.length,
  });

  return {
    detected: true,
    patterns: detectedPatterns,
    riskLevel,
  };
}

/**
 * Enforcement gate: call on every user-supplied prompt before it reaches a
 * model. High-risk inputs (3+ injection patterns) are rejected outright;
 * medium/low only log (detection is heuristic — over-blocking would break
 * legitimate study questions like "ignore the previous chapter…").
 */
export function assertPromptAllowed(input: string, meta?: { userId?: string }): void {
  if (typeof input !== "string" || !input.trim()) return;
  const result = detectPromptInjection(input);
  if (result.riskLevel === "high") {
    auditLog({
      userId: meta?.userId ?? "",
      action: "prompt_injection_blocked",
      resource: "ai",
      details: { patterns: result.patterns, inputLength: input.length },
    });
    throw new ValidationError(
      "That request looks like a prompt-injection attempt and was blocked. Please rephrase your study question.",
    );
  }
}

/**
 * Detect suspicious content in user input.
 */
export function detectSuspiciousContent(input: string): {
  detected: boolean;
  patterns: string[];
  sanitizedInput: string;
} {
  const detectedPatterns: string[] = [];
  let sanitized = input;

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source);
      // Remove the suspicious content
      sanitized = sanitized.replace(pattern, "[REMOVED]");
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
    sanitizedInput: sanitized,
  };
}

/**
 * Sanitize user input for safe processing.
 */
export function sanitizeInput(input: string): {
  sanitized: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let sanitized = input;

  // Check for prompt injection
  const injection = detectPromptInjection(input);
  if (injection.detected) {
    warnings.push(`সম্ভাব্য prompt injection সনাক্ত করা হয়েছে (${injection.riskLevel})`);
  }

  // Check for suspicious content
  const suspicious = detectSuspiciousContent(input);
  if (suspicious.detected) {
    warnings.push(`সম্ভাব্য ক্ষতিকর বিষয়বস্তু সনাক্ত করা হয়েছে`);
    sanitized = suspicious.sanitizedInput;
  }

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Limit length
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.slice(0, MAX_LENGTH);
    warnings.push(`ইনপুট সীমা অতিক্রম করেছে, ${MAX_LENGTH} ক্যারেক্টে সীমাবদ্ধ করা হয়েছে`);
  }

  return { sanitized, warnings };
}

/** Rate limit configuration for write operations. */
const WRITE_RATE_LIMITS = {
  /** Maximum write operations per minute. */
  maxPerMinute: 10,
  /** Maximum write operations per hour. */
  maxPerHour: 100,
  /** Cooldown period after hitting limit (seconds). */
  cooldownSeconds: 60,
};

/** In-memory rate limit store. */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for write operations.
 */
export function checkWriteRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const key = `write:${userId}`;
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // Reset or create new entry
    const resetAt = now + 60 * 1000; // 1 minute window
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: WRITE_RATE_LIMITS.maxPerMinute - 1, resetAt };
  }

  if (entry.count >= WRITE_RATE_LIMITS.maxPerMinute) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: WRITE_RATE_LIMITS.maxPerMinute - entry.count, resetAt: entry.resetAt };
}

/** Audit log entry for sensitive operations. */
export type AuditEntry = {
  timestamp: string;
  userId: string;
  action: string;
  resource: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

/**
 * Log an audit event for sensitive operations. Dual-sink: structured log
 * (primary trail) + best-effort AuditLog row (indexed compliance queries).
 * The DB write never throws — audit must not break the request it observes.
 */
export function auditLog(entry: Omit<AuditEntry, "timestamp">): void {
  const fullEntry: AuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Log to structured logger
  log.info("AUDIT", {
    audit: fullEntry,
  });

  // Best-effort persistence (fire-and-forget, errors swallowed by design).
  void import("~backend/db").then(({ prisma }) =>
    prisma.auditLog
      .create({
        data: {
          userId: entry.userId || null,
          action: entry.action,
          resource: entry.resource,
          details: (entry.details ?? {}) as never,
          ip: entry.ip ?? "",
        },
      })
      .catch(() => {}),
  ).catch(() => {});
}

/**
 * Validate that an operation is within security boundaries.
 */
export function validateSecurityBoundary(opts: {
  userId: string;
  action: string;
  resource: string;
  ip?: string;
}): { valid: boolean; reason?: string } {
  // Check write rate limit
  if (opts.action.startsWith("write.") || opts.action.startsWith("delete.")) {
    const rateLimit = checkWriteRateLimit(opts.userId);
    if (!rateLimit.allowed) {
      return {
        valid: false,
        reason: `রেট লিমিট অতিক্রম। ${rateLimit.resetAt - Date.now()}ms পর আবার চেষ্টা করুন।`,
      };
    }
  }

  // Log the operation
  auditLog({
    userId: opts.userId,
    action: opts.action,
    resource: opts.resource,
    ip: opts.ip,
  });

  return { valid: true };
}
