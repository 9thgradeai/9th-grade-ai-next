import { describe, it, expect, vi, afterEach } from "vitest";
import { runAgentTurn } from "@/lib/services/ai/agent";

function sseResponse(events: Array<{ event: string; data: unknown }>, headers: Record<string, string> = {}) {
  const enc = new TextEncoder();
  const raw = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(raw));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

describe("runAgentTurn (study coach SSE client)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accumulates deltas and resolves typed blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(
          [
            { event: "agent.started", data: { runId: "r1", conversationId: "c1" } },
            { event: "tool.started", data: { name: "get_my_profile" } },
            { event: "tool.completed", data: { name: "get_my_profile", ok: true } },
            { event: "message.delta", data: { text: "Hello " } },
            { event: "message.delta", data: { text: "there" } },
            {
              event: "block.created",
              data: {
                type: "weakness",
                subject: "গণিত",
                topic: "Algebra",
                accuracy: 40,
                attempts: 10,
                wrongCount: 6,
                advice: "Practice",
                actions: [],
              },
            },
            { event: "agent.completed", data: { runId: "r1", conversationId: "c1", provider: "mock", model: "mock", steps: 2 } },
          ],
          { "x-run-id": "r1", "x-conversation-id": "c1", "x-ai-source": "mock" },
        ),
      ),
    );

    const deltas: string[] = [];
    const tools: Array<{ name: string; action: string }> = [];
    const result = await runAgentTurn({
      question: "What next?",
      onDelta: (c) => deltas.push(c),
      onTool: (t) => tools.push({ name: t.name, action: t.action }),
    });

    expect(deltas.join("")).toBe("Hello there");
    expect(tools).toEqual([
      { name: "get_my_profile", action: "started" },
      { name: "get_my_profile", action: "completed" },
    ]);
    expect(result.text).toBe("Hello there");
    expect(result.conversationId).toBe("c1");
    expect(result.steps).toBe(2);
    expect(result.blocks[0].type).toBe("weakness");
    if (result.blocks[0].type === "weakness") {
      expect(result.blocks[0].topic).toBe("Algebra");
    }
  });

  it("re-throws agent.error payloads as the rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([{ event: "agent.error", data: { code: "AI_PROVIDER_ERROR", message: "coach down" } }]),
      ),
    );
    await expect(runAgentTurn({ question: "x" })).rejects.toThrow("coach down");
  });
});
