// Provider abstraction — the application talks to this interface, never to
// Groq/Anthropic directly. ModelRouter picks a concrete provider per task.

import type { AIMessageInput } from "../types";

export type LLMProviderName = "groq" | "anthropic" | "mock";

export type LLMImageInput = {
  type: "image";
  dataUrl: string; // full data URL, e.g. "data:image/png;base64,..."
};

export type LLMRequest = {
  system: string;
  messages: AIMessageInput[];
  images?: LLMImageInput[];
  maxTokens?: number;
  temperature?: number;
};

export type LLMResult = {
  text: string;
  provider: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type LLMStreamResult = {
  stream: ReadableStream<Uint8Array>;
  provider: LLMProviderName;
  model: string;
  /** Resolves when the stream has fully drained (or was cancelled). */
  done: Promise<void>;
  /** Accumulated full text produced by the stream, for persistence. */
  getFullText: () => string;
};

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  readonly supportsVision: boolean;
  generate(req: LLMRequest): Promise<LLMResult>;
  stream(req: LLMRequest): Promise<LLMStreamResult>;
}

/**
 * Convert an async-iterable of text chunks into a UTF-8 byte stream while
 * accumulating the full text for persistence. Resolves `done` when the
 * stream is fully consumed or cancelled.
 */
export async function textStreamToAccumulatingStream(
  textStream: AsyncIterable<string>,
): Promise<{ stream: ReadableStream<Uint8Array>; done: Promise<void>; getFullText: () => string }> {
  const encoder = new TextEncoder();
  const iterator = textStream[Symbol.asyncIterator]();
  let full = "";
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done: iteratorDone } = await iterator.next();
        if (iteratorDone) {
          controller.close();
          resolveDone();
          return;
        }
        full += value;
        controller.enqueue(encoder.encode(value));
      } catch (err) {
        controller.error(err);
        resolveDone();
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
      resolveDone();
    },
  });

  return { stream, done, getFullText: () => full };
}

/** Generate a byte stream that emits `text` in small chunks (mock provider). */
export async function chunkedTextStream(text: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  done: Promise<void>;
  getFullText: () => string;
}> {
  const encoder = new TextEncoder();
  let full = "";
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  // Fixed-size slices — never drops characters (a regex-based chunker could
  // silently skip runs with no whitespace boundary).
  const size = 12;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  let index = 0;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        resolveDone();
        return;
      }
      const chunk = chunks[index++];
      full += chunk;
      controller.enqueue(encoder.encode(chunk));
      await new Promise((r) => setTimeout(r, 25));
    },
    cancel() {
      resolveDone();
    },
  });

  return { stream, done, getFullText: () => full };
}