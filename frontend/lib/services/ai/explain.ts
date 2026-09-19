"use client";

import { streamChat, parseStreamedJson } from "./client";
import type { AIExplanationDto } from "./types";

export type ExplainOptions = {
  questionId?: number;
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer?: string;
  subject?: string;
  topic?: string;
};

/** Get a detailed AI explanation for an MCQ. Streams the response. */
export async function getExplanation(opts: ExplainOptions): Promise<AIExplanationDto> {
  const body: Record<string, unknown> = {
    question: opts.question,
    options: opts.options,
    correctAnswer: opts.correctAnswer,
  };
  if (opts.questionId) body.questionId = opts.questionId;
  if (opts.userAnswer) body.userAnswer = opts.userAnswer;
  if (opts.subject) body.subject = opts.subject;
  if (opts.topic) body.topic = opts.topic;

  let full = "";
  await streamChat({ url: "/api/ai/explain", body, onChunk: (c) => { full += c; } });
  const parsed = parseStreamedJson(full);
  return (
    (parsed as AIExplanationDto) ?? {
      correctAnswerExplanation: "দুঃখিত, AI ব্যাখ্যা এইমাত্র উপলব্ধ নয়। অনুগ্রহ করে পরে আবার চেষ্টা করুন।",
      whyOthersWrong: [],
      source: "mock",
    }
  );
}
