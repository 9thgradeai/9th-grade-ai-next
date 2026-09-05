// Anthropic provider — hosted Claude for reasoning + vision tasks.
// Uses the Vercel AI SDK. Structured output is requested via the system
// prompt and validated by the application layer (never trusted blindly).

import "server-only";

import { generateText, streamText, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AppError } from "~backend/errors";
import type { AIMessageInput } from "../types";
import { estimateTokens } from "./groq";
import {
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type LLMStreamResult,
  textStreamToAccumulatingStream,
} from "./types";

const ANTHROPIC_MODEL = process.env.AI_ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const COST_PER_1K_INPUT = 0.003; // $3 / M input tokens
const COST_PER_1K_OUTPUT = 0.015; // $15 / M output tokens

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string };

function toCoreMessages(
  messages: AIMessageInput[],
  images?: LLMRequest["images"],
): CoreMessage[] {
  const mapped = messages.map<CoreMessage>((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (images && images.length > 0) {
    const lastUser = [...mapped].reverse().find((m) => m.role === "user");
    if (lastUser && typeof lastUser.content === "string") {
      const parts: ContentPart[] = [
        { type: "text", text: lastUser.content },
        ...images.map((img) => ({
          type: "image" as const,
          image: img.dataUrl,
        })),
      ];
      lastUser.content = parts;
    }
  }
  return mapped;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  readonly supportsVision = true;

  private client;

  constructor(apiKey: string, model: string = ANTHROPIC_MODEL) {
    this.model = model;
    this.client = createAnthropic({ apiKey });
  }

  async generate(req: LLMRequest): Promise<LLMResult> {
    const result = await generateText({
      model: this.client(this.model),
      system: req.system,
      messages: toCoreMessages(req.messages, req.images),
      maxTokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
    });

    if (!result.text.trim()) {
      throw new AppError(502, "The AI provider returned an empty response.", "AI_EMPTY_RESPONSE");
    }

    // Phase 14: provider-reported usage with estimate fallback.
    const inputTokens =
      result.usage?.promptTokens ??
      estimateTokens(req.system + req.messages.map((m) => m.content).join(""));
    const outputTokens = result.usage?.completionTokens ?? estimateTokens(result.text);
    return {
      text: result.text,
      provider: this.name,
      model: this.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd:
        (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT,
    };
  }

  async stream(req: LLMRequest): Promise<LLMStreamResult> {
    const result = streamText({
      model: this.client(this.model),
      system: req.system,
      messages: toCoreMessages(req.messages, req.images),
      maxTokens: req.maxTokens ?? 2048,
      temperature: req.temperature,
    });

    const { stream, done, getFullText } =
      await textStreamToAccumulatingStream(result.textStream);
    return { stream, provider: this.name, model: this.model, done, getFullText };
  }
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}