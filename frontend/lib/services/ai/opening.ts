"use client";

// getAIOpening — personalized AI-workspace opening (greeting, honest summary,
// deterministic insights and data-backed starter prompts). No LLM quota.

import type { AIOpeningDto } from "@/lib/types";
import { aiJson } from "./client";

export async function getAIOpening(): Promise<AIOpeningDto> {
  const data = await aiJson<{ opening: AIOpeningDto }>("/api/ai/opening", "GET");
  return data.opening;
}