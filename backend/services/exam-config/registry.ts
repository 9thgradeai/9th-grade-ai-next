// backend/services/exam-config/registry.ts — the versioned exam-config registry.
//
// One lookup point for the canonical paper shape of each exam ecosystem. Pure
// data + pure functions (no DB, no `server-only`), so the same registry can be
// unit-tested and served to the dashboard through /api/exam/config.
//
// Versioning rule (master spec §3): a config's `version` MUST be bumped whenever
// official marks, the topic hierarchy, suballocations, or the scoring policy
// change. The registry returns the ACTIVE (current) version per ecosystem; a
// future revision is added by appending a new config object and pointing
// `ACTIVE` at it — old versions stay referenced by history/attempt rows through
// `configVersion`, so a past paper can always be re-explained.

import type { ExamConfig, ExamEcosystemCode, ValidationResult } from "./types";
import { BCS_PRELIMINARY_CONFIG } from "./bcs";
import { BANK_PRELIMINARY_CONFIG } from "./bank";
import { validateExamConfig } from "./validate";

/** All known config versions, keyed by ecosystem then version (ascending). */
const VERSIONS: Record<ExamEcosystemCode, Map<number, ExamConfig>> = {
  BCS: new Map([[BCS_PRELIMINARY_CONFIG.version, BCS_PRELIMINARY_CONFIG]]),
  BANGLADESH_BANK: new Map([[BANK_PRELIMINARY_CONFIG.version, BANK_PRELIMINARY_CONFIG]]),
};

/** The config version currently served for each ecosystem. */
const ACTIVE: Record<ExamEcosystemCode, number> = {
  BCS: BCS_PRELIMINARY_CONFIG.version,
  BANGLADESH_BANK: BANK_PRELIMINARY_CONFIG.version,
};

const ECOSYSTEM_CODES: readonly ExamEcosystemCode[] = ["BCS", "BANGLADESH_BANK"];

/** Narrow a raw string (e.g. a query param) to a known ecosystem code. */
export function isExamEcosystemCode(code: unknown): code is ExamEcosystemCode {
  return typeof code === "string" && (ECOSYSTEM_CODES as readonly string[]).includes(code);
}

/** Every ecosystem code the registry knows about. */
export function listExamEcosystems(): ExamEcosystemCode[] {
  return [...ECOSYSTEM_CODES];
}

/**
 * The active config for an ecosystem, or `null` when the code is unknown.
 * Never throws — callers that need a hard failure use `requireExamConfig`.
 */
export function getExamConfig(code: string): ExamConfig | null {
  if (!isExamEcosystemCode(code)) return null;
  const version = ACTIVE[code];
  return VERSIONS[code].get(version) ?? null;
}

/**
 * A specific historical version of a config, or `null` when absent. Used when
 * re-explaining a paper assembled under an earlier version.
 */
export function getExamConfigVersion(
  code: string,
  version: number,
): ExamConfig | null {
  if (!isExamEcosystemCode(code)) return null;
  return VERSIONS[code].get(version) ?? null;
}

/** Every known version number for an ecosystem, ascending. */
export function listExamConfigVersions(code: string): number[] {
  if (!isExamEcosystemCode(code)) return [];
  return [...VERSIONS[code].keys()].sort((a, b) => a - b);
}

// ── Validation (cached) ────────────────────────────────────
// Configs are immutable module constants, so a validation result is stable for
// a given (code, version). Cache it to keep /api/exam/config cheap on warm
// instances and to avoid re-walking the hierarchy per request.

const validationCache = new Map<string, ValidationResult>();

function validationKey(config: ExamConfig): string {
  return `${config.examCode}:${config.version}`;
}

/** Cached validation for a config object. */
export function getExamConfigValidation(config: ExamConfig): ValidationResult {
  const key = validationKey(config);
  const cached = validationCache.get(key);
  if (cached) return cached;
  const result = validateExamConfig(config);
  validationCache.set(key, result);
  return result;
}

/** Test/ops seam: clear the validation cache. */
export function clearExamConfigValidationCache(): void {
  validationCache.clear();
}

export type ResolvedExamConfig = {
  config: ExamConfig;
  validation: ValidationResult;
};

/**
 * Resolve an ecosystem code to a validated active config. Returns `null` for an
 * unknown code; returns the config with `validation.valid === false` so the
 * caller can decide how to fail (the API surfaces 500 for a broken config).
 */
export function resolveExamConfig(code: string): ResolvedExamConfig | null {
  const config = getExamConfig(code);
  if (!config) return null;
  return { config, validation: getExamConfigValidation(config) };
}

/** Lightweight summary for the /api/exam/config `examConfig` payload. */
export type ExamConfigSummary = {
  examCode: ExamEcosystemCode;
  version: number;
  label: string;
  labelBn: string;
  totalMarks: number;
  totalQuestions: number;
  durationMin?: number;
  provenance: ExamConfig["provenance"];
  reviewStatus: ExamConfig["reviewStatus"];
  scoring: ExamConfig["scoring"];
  subjectCount: number;
};

export function summarizeExamConfig(config: ExamConfig): ExamConfigSummary {
  return {
    examCode: config.examCode,
    version: config.version,
    label: config.label,
    labelBn: config.labelBn,
    totalMarks: config.totalMarks,
    totalQuestions: config.totalQuestions,
    durationMin: config.durationMin,
    provenance: config.provenance,
    reviewStatus: config.reviewStatus,
    scoring: config.scoring,
    subjectCount: config.subjects.length,
  };
}
