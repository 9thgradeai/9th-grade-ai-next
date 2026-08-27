"use client";

import { aiJson } from "./client";
import type { GeneratedMockTest } from "./types";

export type GenerateMockTestOptions = {
  subject?: string;
  subjectId?: number;
  exam?: string;
  count?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
};

/** Generate an AI-written multiple-choice mock test. */
export async function generateMockTest(opts: GenerateMockTestOptions): Promise<GeneratedMockTest> {
  return aiJson<GeneratedMockTest>("/api/ai/mock-test", "POST", opts);
}
