"use client";

import { aiJsonWithMeta } from "./client";
import type { GeneratedMockTest } from "./types";

export type GenerateMockTestOptions = {
  subject?: string;
  subjectId?: number;
  exam?: string;
  count?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  /** Learner weak-topic labels ("Subject → Topic", max 5) to focus generation. */
  topics?: string[];
};

/** Generate an AI-written multiple-choice mock test. */
export async function generateMockTest(opts: GenerateMockTestOptions): Promise<GeneratedMockTest> {
  const { data, meta } = await aiJsonWithMeta<GeneratedMockTest>("/api/ai/mock-test", "POST", opts);
  return { ...data, source: data.source || meta.source || "ai", model: meta.model || undefined };
}
