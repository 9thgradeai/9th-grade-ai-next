"use client";

// Low-level HTTP helpers for the AI service layer. All AI calls are
// authenticated via cookies; errors are normalized to AIError.

export class AIError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "AIError";
  }
}

async function parseError(res: Response): Promise<AIError> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  return new AIError(
    data.error ?? `AI request failed (${res.status}).`,
    data.code ?? `HTTP_${res.status}`,
    res.status,
  );
}

/** JSON request with credentials + request-id header. */
export async function aiJson<T>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      "x-request-id": crypto.randomUUID(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type StreamChatMeta = {
  conversationId: string;
  source: string;
  intent: string;
  model: string;
};

/**
 * POST a chat body and stream the text response, invoking onChunk per chunk.
 * Returns response metadata from headers (conversation id, AI source, ...).
 */
export async function streamChat(opts: {
  url: string;
  body: Record<string, unknown>;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<StreamChatMeta> {
  const res = await fetch(opts.url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    throw await parseError(res);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) opts.onChunk(chunk);
  }

  return {
    conversationId: res.headers.get("x-conversation-id") ?? "",
    source: res.headers.get("x-ai-source") ?? "",
    intent: res.headers.get("x-ai-intent") ?? "",
    model: res.headers.get("x-ai-model") ?? "",
  };
}