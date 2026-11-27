// backend/services/adaptive-exam/ai-generation-adapter.ts
// AiGenerationPort implementation using the shared provider registry.
// Batches 5–10 questions per call, validates output with a strict schema and
// records provider/model/prompt/usage provenance. Mock output stays labelled.

import "server-only";

import { z } from "zod";

import {
  resolveCandidatesForModelTask,
  reportProviderOutcome,
} from "~backend/ai/providers/registry";
import { parseJsonObject } from "~backend/ai/validation/outputs";
import { withRetry } from "~backend/ai/infrastructure/retry";
import type {
  AdaptiveGenerationRequest,
  AdaptiveGenerationResult,
  AiGenerationPort,
  OptionKey,
  QuestionOptions,
} from "./contracts";
import { adaptiveError } from "./errors";

export const ADAPTIVE_GENERATION_PROMPT_VERSION = "adaptive-generation-v1";
export const ADAPTIVE_GENERATION_BATCH_MIN = 5;
export const ADAPTIVE_GENERATION_BATCH_MAX = 10;

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

const questionSchema = z.object({
  questionText: z.string().min(10).max(4000),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }).strict(),
  correctOption: z.enum(OPTION_KEYS),
  explanation: z.string().min(1).max(4000),
  topicPath: z.string().min(1),
  subtopicPath: z.string().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
}).strict();

const responseSchema = z.object({
  questions: z.array(questionSchema).min(1).max(ADAPTIVE_GENERATION_BATCH_MAX),
}).strict();

function systemPrompt(): string {
  return [
    "You write original multiple-choice questions for a Bangladeshi government exam preparation platform.",
    "The profile, subject, syllabus path, language, difficulty and evidence are authoritative. Never invent exam marks, dates, official authorship or answer authority.",
    `Return strict JSON only: {"questions":[{"questionText":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correctOption":"A|B|C|D","explanation":"...","topicPath":"...","subtopicPath":"...","difficulty":"EASY|MEDIUM|HARD"}]}.`,
    "Exactly four non-empty options and exactly one correctOption are required. Do not include markdown, comments, or extra fields.",
    "Evidence snippets are claims unless independently verified. Do not cite unsupported sources.",
  ].join("\n");
}

function userPrompt(request: AdaptiveGenerationRequest): string {
  const forbidden = request.instructions;
  return [
    `Profile: ${request.profileId} v${request.profileVersion}`,
    `Subject: ${request.subjectId}`,
    `Topic path: ${request.topicPath ?? "(subject-level)"}`,
    `Subtopic path: ${request.subtopicPath ?? "(topic-level)"}`,
    `Language: ${request.language}`,
    `Difficulty: ${request.difficulty}`,
    `Generate exactly ${request.count} distinct questions.`,
    `Subject instructions: ${forbidden}`,
    ...(request.evidence ?? []).map((item) =>
      `Evidence: ${item.snippet ?? ""} (${item.url}${item.publishedAt ? `, published ${item.publishedAt}` : ""})`),
  ].join("\n");
}

function adaptiveFailure(request: AdaptiveGenerationRequest, message: string): never {
  throw adaptiveError("ADAPTIVE_GENERATION_FAILED", message, {
    stage: "generation",
    requestId: request.requestId,
    metadata: {
      profileId: request.profileId,
      subjectId: request.subjectId,
      topicPath: request.topicPath,
    },
  });
}

export function createAiGenerationAdapter(): AiGenerationPort {
  return {
    async generate(request) {
      if (!Number.isInteger(request.count) || request.count < ADAPTIVE_GENERATION_BATCH_MIN || request.count > ADAPTIVE_GENERATION_BATCH_MAX) {
        adaptiveFailure(request, `Batch size must be between ${ADAPTIVE_GENERATION_BATCH_MIN} and ${ADAPTIVE_GENERATION_BATCH_MAX}.`);
      }

      let lastError = "No provider produced a valid batch.";
      const candidates = resolveCandidatesForModelTask("question_generation");
      for (const candidate of candidates) {
        try {
          const { result, totalMs } = await withRetry(
            () => candidate.provider.generate({
              system: systemPrompt(),
              messages: [{ role: "user", content: userPrompt(request) }],
              maxTokens: Math.min(6000, 700 * request.count),
              temperature: 0.7,
              timeoutMs: 45_000,
            }),
            { maxAttempts: 2 },
            { task: "question_generation", provider: candidate.name, profileId: request.profileId },
          );

          const parsed = responseSchema.safeParse(parseJsonObject(result.text));
          if (!parsed.success) {
            lastError = `Invalid JSON shape from ${candidate.name}: ${parsed.error.issues[0]?.message ?? "unknown"}`;
            reportProviderOutcome(candidate.name, false);
            continue;
          }
          if (parsed.data.questions.length !== request.count) {
            lastError = `${candidate.name} returned ${parsed.data.questions.length} questions, expected ${request.count}.`;
            reportProviderOutcome(candidate.name, false);
            continue;
          }

          reportProviderOutcome(candidate.name, true);
          const isMock = candidate.name === "mock";
          return {
            questions: parsed.data.questions.map((question) => ({
              questionText: question.questionText,
              options: question.options as QuestionOptions,
              correctOption: question.correctOption as OptionKey,
              explanation: question.explanation,
              topicPath: question.topicPath,
              ...(question.subtopicPath ? { subtopicPath: question.subtopicPath } : {}),
              difficulty: question.difficulty,
              provenance: {
                sourceType: request.sourceType,
                generation: {
                  provider: candidate.name,
                  model: result.model,
                  promptVersion: ADAPTIVE_GENERATION_PROMPT_VERSION,
                  repairAttempts: 0,
                  mock: isMock,
                  usage: {
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    costUsd: result.estimatedCostUsd,
                    durationMs: totalMs,
                  },
                },
              },
            })),
            provider: candidate.name,
            model: result.model,
            promptVersion: ADAPTIVE_GENERATION_PROMPT_VERSION,
            durationMs: totalMs,
            usage: {
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.estimatedCostUsd,
              durationMs: totalMs,
            },
          };
        } catch (error) {
          reportProviderOutcome(candidate.name, false);
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      adaptiveFailure(request, lastError);
    },
  };
}
