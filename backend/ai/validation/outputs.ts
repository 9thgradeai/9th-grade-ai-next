// Output validation — model output is never trusted blindly. JSON responses
// are parsed and normalized to the expected shape before being returned.

import type { SolverResult } from "../types";

export const MAX_RESPONSE_CHARS = 8_000;

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // Extract the first balanced {...} block as a fallback.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
}

/** Normalize a raw model response into a valid SolverResult. */
export function validateSolverOutput(raw: string, fallback: string): SolverResult {
  const parsed = parseJsonObject(raw);
  const solution = parsed ? asString(parsed.solution, fallback) : fallback;
  const steps = parsed ? asStringArray(parsed.steps) : [];

  return {
    solution: solution.slice(0, MAX_RESPONSE_CHARS),
    steps: steps.slice(0, 20),
    explanation: parsed ? asString(parsed.explanation, "") : undefined,
    relatedConcept: parsed ? asString(parsed.relatedConcept, "") : undefined,
    misconception: parsed ? asString(parsed.misconception, "") : undefined,
    source: "ai",
  };
}

/** Sanitize free-form chat text before returning/persisting. */
export function sanitizeReply(text: string): string {
  return text.trim().slice(0, MAX_RESPONSE_CHARS);
}