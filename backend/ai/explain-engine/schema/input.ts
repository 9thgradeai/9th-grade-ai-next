// Request contract for POST /api/ai/explain-v2.
//
// Deliberately does NOT accept `correctAnswer`, `correctAnswers`, or
// `explanation`: the stored key is loaded server-side only, after the
// independent finding exists. Unknown keys are stripped by Zod (not trusted).

import { z } from "zod";

const MAX_TEXT = 4_000;

export const ExplainV2RequestSchema = z.object({
  questionId: z.number().int().positive(),
  /** Text of the option the student chose (single-answer legacy shape). */
  selectedAnswer: z.string().max(MAX_TEXT).optional(),
  /** Texts of every option the student chose (multi-answer questions). */
  selectedAnswers: z.array(z.string().max(MAX_TEXT)).max(10).optional(),
  /** Canonical option ID, when the client already knows it. */
  selectedOptionId: z.string().max(120).optional(),
  selectedOptionIds: z.array(z.string().max(120)).max(10).optional(),
  /**
   * The option texts in the order the student actually saw them (the UI
   * shuffles per session). Used only to verify a permutation of the stored
   * options and to map display labels — never as an answer source.
   */
  displayOptions: z.array(z.string().max(MAX_TEXT)).min(2).max(12).optional(),
  /** The session attempt (practice sessions are client-persisted). */
  attemptId: z.string().max(120).optional(),
  /** Caller hint; the server may still decline (e.g. pure maths). */
  enableSearch: z.boolean().optional(),
});

export type ExplainV2Request = z.infer<typeof ExplainV2RequestSchema>;
