// Groq provider — open-weight models served by Groq (open-source primary).
// Uses the Vercel AI SDK. Retries on empty output / transient provider errors
// (Groq's reasoning models intermittently return empty and the free tier
// rate-limits under load).

import "server-only";

import { generateText, streamText, type CoreMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { AppError } from "~backend/errors";
import type { AIMessageInput } from "../types";
import {
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type LLMStreamResult,
  textStreamToAccumulatingStream,
} from "./types";

const GROQ_MODEL = process.env.AI_GROQ_MODEL ?? "openai/gpt-oss-120b";
// Provider-swap point (Phase 4): Groq serves an OpenAI-compatible API, so
// pointing AI_GROQ_BASE_URL at another OpenAI-compatible gateway swaps the
// inference backend without changing any provider code.
const GROQ_BASE_URL = process.env.AI_GROQ_BASE_URL;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

// Approximate open-weights cost on Groq's free/usage tiers (USD per 1K tokens).
const COST_PER_1K_INPUT = 0.0;
const COST_PER_1K_OUTPUT = 0.0;

function toCoreMessages(messages: AIMessageInput[]): CoreMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

export class GroqProvider implements LLMProvider {
  readonly name = "groq" as const;
  readonly model: string;
  readonly supportsVision = false;

  private client;

  constructor(apiKey: string, model: string = GROQ_MODEL) {
    this.model = model;
    this.client = createGroq({ apiKey, ...(GROQ_BASE_URL ? { baseURL: GROQ_BASE_URL } : {}) });
  }

  async generate(req: LLMRequest): Promise<LLMResult> {
    if (req.images && req.images.length > 0) {
      throw new AppError(400, "The configured Groq model does not support images.", "MODEL_NO_VISION");
    }

    const messages = toCoreMessages(req.messages);
    let text = "";
    let lastInputTokens: number | undefined;
    let lastOutputTokens: number | undefined;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model: this.client(this.model),
          system: req.system,
          messages,
          maxTokens: req.maxTokens ?? 2048,
          temperature: req.temperature,
        });
        if (result.text.trim()) {
          text = result.text;
          // Phase 14: prefer provider-reported usage over the chars/4 estimate.
          if (result.usage?.promptTokens) lastInputTokens = result.usage.promptTokens;
          if (result.usage?.completionTokens) lastOutputTokens = result.usage.completionTokens;
          break;
        }
      } catch {
        // transient provider error — retry below
      }
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    if (!text.trim()) {
      throw new AppError(502, "The AI provider returned an empty response.", "AI_EMPTY_RESPONSE");
    }

    // Fall back to the crude estimate only when the provider omits usage.
    const inputTokens =
      lastInputTokens ?? estimateTokens(
        req.system + " " + req.messages.map((m) => m.content).join(" "),
      );
    const outputTokens = lastOutputTokens ?? estimateTokens(text);
    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd:
        (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT,
    };
  }

  async stream(req: LLMRequest): Promise<LLMStreamResult> {
    if (req.images && req.images.length > 0) {
      throw new AppError(400, "The configured Groq model does not support images.", "MODEL_NO_VISION");
    }

    const result = streamText({
      model: this.client(this.model),
      system: req.system,
      messages: toCoreMessages(req.messages),
      maxTokens: req.maxTokens ?? 2048,
      temperature: req.temperature,
    });

    const { stream, done, getFullText } =
      await textStreamToAccumulatingStream(result.textStream);
    return { stream, provider: this.name, model: this.model, done, getFullText };
  }
}

// Crude token estimate (chars / 4) — only used for usage accounting.
export function estimateTokens(input: string): number {
  return Math.max(1, Math.ceil(input.length / 4));
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}