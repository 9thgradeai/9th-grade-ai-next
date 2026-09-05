/* POST /api/ai/agent — bounded, tool-using AI agent loop over SSE.
   Authenticated. Streaming event protocol:
     agent.started, agent.status, tool.started, tool.completed,
     message.delta, block.created, agent.completed, agent.error
   Chain-of-thought is never streamed or persisted — only typed blocks. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { createAgentTurn, type AgentStatus, type AgentBlock } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export const maxDuration = 60;

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use the AI study coach.");
    }

    await enforceAiQuotas(request, "assistant", userId);

    const body = await request.json().catch(() => ({}));
    const events: Uint8Array[] = [];

    const onStatus = (status: AgentStatus) => {
      if (status.tool) {
        events.push(
          sse(status.tool.action === "started" ? "tool.started" : "tool.completed", {
            name: status.tool.name,
            ok: status.tool.ok,
          }),
        );
      } else if (status.message) {
        events.push(sse("agent.status", { message: status.message }));
      }
    };

    const outcome = await createAgentTurn({ userId, request: body, onStatus });

    // Assemble the SSE stream: identity, any loop events, message deltas,
    // typed blocks, then completion.
    const text = outcome.text;
    let deltaIndex = 0;
    const chunkSize = 40;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(
            sse("agent.started", { runId: outcome.runId, conversationId: outcome.conversationId }),
          );
          for (const ev of events) controller.enqueue(ev);
          while (deltaIndex < text.length) {
            const piece = text.slice(deltaIndex, deltaIndex + chunkSize);
            deltaIndex += chunkSize;
            controller.enqueue(sse("message.delta", { text: piece }));
          }
          const blocks: AgentBlock[] = outcome.blocks;
          for (const block of blocks) controller.enqueue(sse("block.created", block));
          controller.enqueue(
            sse("agent.completed", {
              runId: outcome.runId,
              conversationId: outcome.conversationId,
              provider: outcome.provider,
              model: outcome.model,
              steps: outcome.steps,
              source: outcome.provider,
            }),
          );
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    const res = new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Run-Id": outcome.runId,
        "X-Conversation-Id": outcome.conversationId,
        "X-AI-Source": outcome.provider,
        "X-AI-Model": outcome.model,
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const errEvent = sse("agent.error", {
      code: err instanceof Error && "code" in err ? (err as { code?: string }).code : "AI_PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "The study coach failed.",
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(errEvent);
        controller.close();
      },
    });
    const res = new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
    applySecurityHeaders(res);
    return res;
  }
}