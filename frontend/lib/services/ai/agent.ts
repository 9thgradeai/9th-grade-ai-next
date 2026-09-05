"use client";

// SSE client for the AI study coach (/api/ai/agent). The route streams typed
// events (agent.started, agent.status, tool.started, tool.completed,
// message.delta, block.created, agent.completed, agent.error); this helper
// parses the stream, forwards deltas/blocks to callbacks, and resolves to a
// full AgentTurnResultDto on completion.

import { AIError } from "./client";
import type { AgentBlockDto, AgentTurnResultDto } from "@/lib/types";

export type AgentToolEvent = {
  name: string;
  action: "started" | "completed";
  ok?: boolean;
};

export type AgentTurnOptions = {
  conversationId?: string;
  question: string;
  context?: {
    subjectId?: number;
    topicId?: number;
    topicPath?: string;
    questionId?: number;
  };
  intent?: string;
  onDelta?: (text: string) => void;
  onStatus?: (message: string) => void;
  onTool?: (tool: AgentToolEvent) => void;
  onBlock?: (block: AgentBlockDto) => void;
  onCompleted?: (meta: { runId: string; conversationId: string }) => void;
  signal?: AbortSignal;
};

function sseEnvelope(
  event: string,
  raw: string,
): { event: string; data: string } | null {
  const lines = raw.split("\n");
  let data = "";
  let matched = false;
  for (const line of lines) {
    if (line.startsWith("data:")) {
      data += line.slice(5).replace(/^ /, "") + "\n";
      matched = true;
    }
  }
  if (!matched) return null;
  // fall back to the payload line when no `event:` field is present
  const name = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
  return { event: name ?? event, data: data.trimEnd() };
}

export async function runAgentTurn(opts: AgentTurnOptions): Promise<AgentTurnResultDto> {
  const body: Record<string, unknown> = {
    question: opts.question,
  };
  if (opts.conversationId) body.conversationId = opts.conversationId;
  if (opts.context && Object.keys(opts.context).length > 0) body.context = opts.context;
  if (opts.intent) body.intent = opts.intent;

  const res = await fetch("/api/ai/agent", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    signal: opts.signal,
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new AIError(
      data.error ?? `Study coach request failed (${res.status}).`,
      data.code ?? `HTTP_${res.status}`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const blocks: AgentBlockDto[] = [];
  let conversationId = res.headers.get("x-conversation-id") ?? opts.conversationId ?? "";
  let provider = res.headers.get("x-ai-source") ?? "mock";
  let model = res.headers.get("x-ai-model") ?? "";
  let runId = res.headers.get("x-run-id") ?? "";
  let steps = 0;

  const emit = (envelope: { event: string; data: string } | null) => {
    if (!envelope) return;
    const { event, data } = envelope;
    let parsed: unknown;
    try {
      parsed = data ? JSON.parse(data) : null;
    } catch {
      return;
    }
    if (event === "message.delta" && parsed && typeof parsed === "object") {
      const piece = (parsed as { text?: string }).text ?? "";
      text += piece;
      opts.onDelta?.(piece);
    } else if (event === "block.created" && parsed) {
      const block = parsed as AgentBlockDto;
      blocks.push(block);
      opts.onBlock?.(block);
    } else if (event === "agent.status" && parsed && typeof parsed === "object") {
      opts.onStatus?.((parsed as { message?: string }).message ?? "");
    } else if ((event === "tool.started" || event === "tool.completed") && parsed) {
      const t = parsed as { name?: string; ok?: boolean };
      opts.onTool?.({
        name: t.name ?? "tool",
        action: event === "tool.started" ? "started" : "completed",
        ok: t.ok,
      });
    } else if (event === "agent.completed" && parsed) {
      const meta = parsed as {
        runId?: string;
        conversationId?: string;
        provider?: string;
        model?: string;
        steps?: number;
      };
      runId = meta.runId ?? runId;
      conversationId = meta.conversationId ?? conversationId;
      provider = meta.provider ?? provider;
      model = meta.model ?? model;
      steps = meta.steps ?? 0;
      opts.onCompleted?.({ runId, conversationId });
    } else if (event === "agent.error") {
      // surface as a normal error
      throw new AIError(
        (parsed as { message?: string })?.message ?? "The study coach failed.",
        (parsed as { code?: string })?.code ?? "AGENT_ERROR",
        res.status,
      );
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf("\n\n");
      if (sep === -1) {
        // tolerate CRLF blank lines
        sep = buffer.indexOf("\r\n\r\n");
      }
      while (sep !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + (buffer.startsWith("\r\n\r\n", sep) ? 4 : 2));
        emit(sseEnvelope("message", raw));
        sep = buffer.indexOf("\n\n");
        if (sep === -1) sep = buffer.indexOf("\r\n\r\n");
      }
    }
    if (buffer.trim()) emit(sseEnvelope("message", buffer));
  } finally {
    reader.releaseLock();
  }

  return { conversationId, runId, provider, model, steps, text, blocks, source: provider };
}