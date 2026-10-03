// Mock provider — clearly-labelled fallback when no API key is configured.
// Keeps local dev / CI working and makes it obvious the response is not real.

import "server-only";

import type { AIMessageInput } from "../types";
import {
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type LLMStreamResult,
  chunkedTextStream,
} from "./types";

function mockText(task: string, messages: AIMessageInput[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // Honest in both cases: either no key is configured, or a configured key's
  // provider call failed (invalid key, retired model name, network outage, or
  // an open circuit breaker after repeated failures). The latter is
  // indistinguishable here by design — the server logs carry the real error.
  const label =
    "MOCK — real AI is unavailable. No key? Set GROQ_API_KEY / ANTHROPIC_API_KEY and restart the server. " +
    "Key IS set? Then the provider call failed (bad key, bad model, network) — check the server logs for the provider error.";
  const question = lastUser ? `Your question: "${lastUser.slice(0, 120)}"` : "";
  if (task === "agent") {
    // Valid ToolCallEnvelope so the agent loop pipeline is exercised end-to-end.
    return JSON.stringify({
      thought: "No real provider available — returning a labelled text only response.",
      blocks: [
        {
          type: "text",
          text: `${label}\n\n${question}`,
        },
      ],
    });
  }
  if (task === "solver") {
    return (
      `${label}\n\n${question}\n\n` +
      '{"solution": "Set a real API key to get a genuine step-by-step solution. ' +
      'Configure GROQ_API_KEY or ANTHROPIC_API_KEY to enable the AI solver.", ' +
      '"steps": ["1. Set GROQ_API_KEY or ANTHROPIC_API_KEY in .env.local.", ' +
      '"2. Restart the dev server.", "3. Ask the question again."], ' +
      '"explanation": "This is a labelled mock response — no real model was called.", ' +
      '"relatedConcept": "AI solver configuration"}'
    );
  }
  return (
    `${label}\n\n${question}\n\n` +
    "আমি বিষয়টি সহজভাবে বুঝিয়ে দেব। প্রথমে মূল ধারণাটি দেখি, তারপর একটি উদাহরণ দিব।"
  );
}

export class MockProvider implements LLMProvider {
  readonly name = "mock" as const;
  readonly model = "mock";
  readonly supportsVision = false;

  constructor(private readonly task: string) {}

  async generate(req: LLMRequest): Promise<LLMResult> {
    await new Promise((r) => setTimeout(r, 300));
    const text = mockText(this.task, req.messages);
    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  async stream(req: LLMRequest): Promise<LLMStreamResult> {
    const { stream, done, getFullText } = await chunkedTextStream(
      mockText(this.task, req.messages),
    );
    return { stream, provider: this.name, model: this.model, done, getFullText };
  }
}