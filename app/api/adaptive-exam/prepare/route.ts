import { AppError } from "~backend/errors";
import type { PrepareAdaptiveExamCommand } from "~backend/services/adaptive-exam/contracts";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  adaptiveContext,
  asRecord,
  assertNoUnknownFields,
  optionalEnum,
  optionalString,
  requireBoolean,
  requireEnum,
  requireInteger,
  requireString,
  requireStringArray,
  runAdaptiveRoute,
} from "../_shared";

const FAMILIES = ["BCS", "BANK", "OTHERS"] as const;
const MODES = [
  "HISTORICAL_PATTERN",
  "BALANCED",
  "HIGH_YIELD",
  "ADAPTIVE",
  "WEAKNESS_FOCUSED",
  "FULL_EXAM_SIMULATION",
] as const;
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD", "MIXED"] as const;
const SOURCES = ["PYQ", "PYQ_DERIVED", "ORIGINAL", "CURRENT_AFFAIRS", "DIAGNOSTIC"] as const;
const LANGUAGES = ["bn", "en"] as const;

function invalid(message: string): never {
  throw new AppError(400, message, "VALIDATION_ERROR");
}

export async function POST(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-prepare",
    needBody: true,
    handler: async ({ userId, requestId, body }) => {
      assertNoUnknownFields(body, [
        "family", "profileId", "subjects", "topics", "requestedQuestionCount",
        "durationMin", "mode", "difficulty", "historicalYearRange", "sourceMix",
        "adaptationEnabled", "languageOverride", "idempotencyKey",
      ]);

      const sourceMix: PrepareAdaptiveExamCommand["sourceMix"] = {};
      if (body.sourceMix !== undefined) {
        const row = asRecord(body.sourceMix, "sourceMix");
        for (const [key, value] of Object.entries(row)) {
          if (!(SOURCES as readonly string[]).includes(key)) invalid("sourceMix contains an unknown source.");
          if (typeof value !== "number" || value < 0 || value > 100) invalid("sourceMix values must be 0–100.");
          sourceMix[key as (typeof SOURCES)[number]] = value;
        }
      }

      const languageOverride: PrepareAdaptiveExamCommand["languageOverride"] = {};
      if (body.languageOverride !== undefined) {
        const row = asRecord(body.languageOverride, "languageOverride");
        for (const [key, value] of Object.entries(row)) {
          if (typeof value !== "string" || !(LANGUAGES as readonly string[]).includes(value)) {
            invalid("languageOverride values must be 'bn' or 'en'.");
          }
          languageOverride[key] = value as "bn" | "en";
        }
      }

      let historicalYearRange: { from: number; to: number } | undefined;
      if (body.historicalYearRange !== undefined) {
        const row = asRecord(body.historicalYearRange, "historicalYearRange");
        const { from, to } = row;
        if (
          typeof from !== "number" || !Number.isInteger(from) ||
          typeof to !== "number" || !Number.isInteger(to) || from > to
        ) {
          invalid("historicalYearRange requires integer from/to values.");
        }
        historicalYearRange = { from: from as number, to: to as number };
      }

      const command: PrepareAdaptiveExamCommand = {
        userId,
        family: requireEnum(body, "family", FAMILIES),
        profileId: requireString(body, "profileId", { min: 3, max: 120 }),
        subjects: requireStringArray(body, "subjects", { min: 1, max: 40 }),
        ...(body.topics !== undefined
          ? { topics: requireStringArray(body, "topics", { min: 0, max: 200 }) }
          : {}),
        requestedQuestionCount: requireInteger(body, "requestedQuestionCount", { min: 1, max: 300 }),
        ...(body.durationMin !== undefined
          ? { durationMin: requireInteger(body, "durationMin", { min: 1, max: 300 }) }
          : {}),
        mode: requireEnum(body, "mode", MODES),
        ...(body.difficulty !== undefined
          ? { difficulty: optionalEnum(body, "difficulty", DIFFICULTIES) }
          : {}),
        ...(historicalYearRange ? { historicalYearRange } : {}),
        ...(Object.keys(sourceMix).length > 0 ? { sourceMix } : {}),
        adaptationEnabled: requireBoolean(body, "adaptationEnabled"),
        ...(Object.keys(languageOverride).length > 0 ? { languageOverride } : {}),
        idempotencyKey: optionalString(body, "idempotencyKey", { min: 8, max: 120 }) ?? `${userId}:${Date.now()}`,
      };

      const services = await createDefaultAdaptiveServices();
      const ctx = await adaptiveContext(userId, requestId);
      const prepared = await services.orchestrator.prepare(ctx, command);
      return { prepared };
    },
  });
}
