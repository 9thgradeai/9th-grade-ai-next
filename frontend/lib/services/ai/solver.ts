"use client";

import { aiJson } from "./client";
import type { SolverResultDto } from "./types";

export type SolverTurnOptions = {
  text?: string;
  imageBase64?: string;
  subject?: string;
  subjectId?: number;
  questionId?: number;
};

/** Solve a question (text/image) via the AI solver. */
export async function solve(opts: SolverTurnOptions): Promise<SolverResultDto> {
  const body: Record<string, unknown> = {};
  if (opts.text) body.text = opts.text;
  if (opts.imageBase64) body.imageBase64 = opts.imageBase64;
  if (opts.subject) body.subject = opts.subject;
  if (opts.subjectId) body.subjectId = opts.subjectId;
  if (opts.questionId) body.questionId = opts.questionId;

  return aiJson<SolverResultDto>("/api/ai/solver", "POST", body);
}