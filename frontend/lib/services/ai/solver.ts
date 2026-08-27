"use client";

import { streamChat, parseStreamedJson } from "./client";
import type { SolverResultDto } from "./types";

export type SolverTurnOptions = {
  text?: string;
  imageBase64?: string;
  subject?: string;
  subjectId?: number;
  questionId?: number;
};

/** Solve a question (text/image) via the AI solver. Streams the response. */
export async function solve(opts: SolverTurnOptions): Promise<SolverResultDto> {
  const body: Record<string, unknown> = {};
  if (opts.text) body.text = opts.text;
  if (opts.imageBase64) body.imageBase64 = opts.imageBase64;
  if (opts.subject) body.subject = opts.subject;
  if (opts.subjectId) body.subjectId = opts.subjectId;
  if (opts.questionId) body.questionId = opts.questionId;

  let full = "";
  await streamChat({ url: "/api/ai/solver", body, onChunk: (c) => { full += c; } });
  const parsed = parseStreamedJson(full);
  return (
    (parsed as SolverResultDto) ?? {
      solution: "Sorry, the AI solver is temporarily unavailable. Please try again.",
      steps: [],
      explanation: "",
      relatedConcept: "",
      source: "mock",
    }
  );
}
