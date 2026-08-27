"use client";

import { aiJson } from "./client";
import type { UsageSummaryDto } from "./types";

/** Fetch the caller's own AI usage/observability summary. */
export async function getUsageSummary(): Promise<UsageSummaryDto> {
  return aiJson<UsageSummaryDto>("/api/ai/usage/summary", "GET");
}
