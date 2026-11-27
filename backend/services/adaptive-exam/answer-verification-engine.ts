// backend/services/adaptive-exam/answer-verification-engine.ts
// Independent answer verification. The generator's claimed answer is treated as
// an unverified assertion; only agreement with an independent solver plus
// deterministic checks can produce an accepted answer key entry.

import "server-only";

import { z } from "zod";

import {
  resolveCandidatesForModelTask,
  reportProviderOutcome,
} from "~backend/ai/providers/registry";
import { extractMathExpressions } from "~backend/ai/math/solver";
import { parseJsonObject } from "~backend/ai/validation/outputs";
import { withRetry } from "~backend/ai/infrastructure/retry";
import type {
  AnswerVerificationDecision,
  AnswerVerificationPort,
  IndependentSolverPort,
  IndependentSolverResult,
  OptionKey,
  QuestionOptions,
} from "./contracts";
import { adaptiveError } from "./errors";

const OPTION_KEYS = ["A", "B", "C", "D"] as const;
const solverSchema = z.object({
  answer: z.enum(OPTION_KEYS),
  explanation: z.string().min(1).max(4000),
}).strict();

/** Independent solver using the existing provider registry, never the generator key. */
export function createIndependentSolver(): IndependentSolverPort {
  return {
    async solve(input) {
      const system = [
        "You independently solve a multiple-choice question for a Bangladeshi government exam.",
        "Do not assume any supplied answer is correct. Evaluate every option from first principles.",
        "Return strict JSON only: {\"answer\":\"A|B|C|D\",\"explanation\":\"...\"}. No markdown or extra fields.",
      ].join("\n");
      const user = [
        `Language: ${input.language}`,
        `Subject: ${input.subjectId}`,
        `Topic: ${input.topicPath}`,
        `Profile: ${input.profileId}`,
        `Question: ${input.questionText}`,
        ...(Object.keys(input.options) as OptionKey[]).map((key) => `${key}. ${input.options[key]}`),
      ].join("\n");

      let lastError = "No solver produced a valid answer.";
      for (const candidate of resolveCandidatesForModelTask("exam_generation")) {
        try {
          const { result } = await withRetry(
            () => candidate.provider.generate({
              system,
              messages: [{ role: "user", content: user }],
              maxTokens: 900,
              temperature: 0.1,
              timeoutMs: 30_000,
            }),
            { maxAttempts: 2 },
            { task: "answer_verification", provider: candidate.name, profileId: input.profileId },
          );
          const parsed = solverSchema.safeParse(parseJsonObject(result.text));
          if (!parsed.success) {
            lastError = `Invalid solver JSON from ${candidate.name}.`;
            reportProviderOutcome(candidate.name, false);
            continue;
          }
          reportProviderOutcome(candidate.name, true);
          const output: IndependentSolverResult = {
            answer: parsed.data.answer,
            explanation: parsed.data.explanation,
            provider: candidate.name,
            model: result.model,
            confidence: candidate.name === "mock" ? 0 : 0.9,
          };
          return output;
        } catch (error) {
          reportProviderOutcome(candidate.name, false);
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      throw adaptiveError("ADAPTIVE_GENERATION_FAILED", `Answer verification failed: ${lastError}`, {
        stage: "validation",
        requestId: input.requestId,
        metadata: { profileId: input.profileId, subjectId: input.subjectId },
      });
    },
  };
}

function numericValue(text: string): number | null {
  const cleaned = String(text)
    .replace(/[,%]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Deterministic arithmetic cross-check; returns null when no safe expression exists. */
function deterministicMathAnswer(questionText: string, options: QuestionOptions): OptionKey | null {
  if (!/(?:math|গণিত|arithmetic|calculate|বিনিয়োগ|শতাংশ|%|\d\s*[+\-×÷*/])/i.test(questionText)) {
    return null;
  }
  const expressions = extractMathExpressions(questionText);
  if (expressions.length === 0) return null;
  const expected = expressions[0].result;
  const matching = (Object.keys(options) as OptionKey[]).filter((key) => {
    const value = numericValue(options[key]);
    return value !== null && Math.abs(value - expected) < 0.001;
  });
  return matching.length === 1 ? matching[0] : null;
}

export function createAnswerVerificationEngine(
  solver: IndependentSolverPort = createIndependentSolver(),
): AnswerVerificationPort {
  return {
    async verify(input) {
      const reject = (reason: string, method: AnswerVerificationDecision["method"] = "unverified"): AnswerVerificationDecision =>
        ({ accepted: false, reason, method, confidence: 0 });

      const keys = Object.keys(input.options) as OptionKey[];
      if (keys.length !== 4 || !OPTION_KEYS.every((key) => typeof input.options[key] === "string" && input.options[key].trim())) {
        return reject("Exactly four non-empty options are required.", "deterministic");
      }
      if (!input.claimedOption || !OPTION_KEYS.includes(input.claimedOption)) {
        return reject("No claimed answer to verify.", "unverified");
      }
      if (/[\u200B-\u200D\uFEFF]/.test(input.questionText)) {
        return reject("Question text contains invisible characters.", "deterministic");
      }

      const isCurrentAffairs = /current.?affairs|চলতি|সাম্প্রতিক/i.test(`${input.subjectId} ${input.topicPath}`);
      if (isCurrentAffairs && !(input.evidence ?? []).some((item) => item.url && item.publishedAt)) {
        return reject("Current-affairs question requires dated evidence.", "deterministic");
      }

      const solved = await solver.solve({
        questionText: input.questionText,
        options: input.options,
        language: input.language,
        subjectId: input.subjectId,
        topicPath: input.topicPath,
        profileId: input.profileId,
        requestId: `verify-${input.profileId}-${input.subjectId}`,
      });
      if (solved.provider === "mock" || solved.confidence <= 0) {
        return reject("Mock solver output cannot verify an answer.", "unverified");
      }
      if (solved.answer !== input.claimedOption) {
        return reject("Independent solver disagrees with the claimed answer.", "independent-solver");
      }

      const deterministic = deterministicMathAnswer(input.questionText, input.options);
      if (deterministic && deterministic !== solved.answer) {
        return reject("Deterministic arithmetic cross-check disagrees.", "deterministic");
      }

      return {
        accepted: true,
        correctOption: input.claimedOption,
        reason: deterministic
          ? "Claimed answer agreed by independent solver and deterministic recomputation."
          : "Claimed answer agreed by independent solver.",
        method: deterministic ? "deterministic" : "independent-solver",
        confidence: deterministic ? 1 : solved.confidence,
      };
    },
  };
}
