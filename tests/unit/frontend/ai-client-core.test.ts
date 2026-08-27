import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aiJson, streamChat, parseStreamedJson, AIError } from "@/lib/services/ai/client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function streamResponse(chunks: string[], headers: Record<string, string> = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/plain", ...headers },
  });
}

describe("aiJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("performs a GET and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await aiJson("/api/ai/x", "GET");
    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/x",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("performs a POST with a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await aiJson("/api/ai/x", "POST", { a: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/x",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ a: 1 }) }),
    );
  });

  it("throws an AIError when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)));
    await expect(aiJson("/api/ai/x", "GET")).rejects.toBeInstanceOf(AIError);
  });

  it("returns undefined on 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await aiJson("/api/ai/x", "DELETE")).toBeUndefined();
  });
});

describe("streamChat", () => {
  it("streams chunks and returns response metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(["Hel", "lo"], {
          "x-conversation-id": "c1",
          "x-ai-source": "mock",
          "x-ai-intent": "tutor",
          "x-ai-model": "mock",
        }),
      ),
    );
    const chunks: string[] = [];
    const meta = await streamChat({
      url: "/api/ai/solve",
      body: { q: 1 },
      onChunk: (c) => chunks.push(c),
    });
    expect(chunks.join("")).toBe("Hello");
    expect(meta).toEqual({
      conversationId: "c1",
      source: "mock",
      intent: "tutor",
      model: "mock",
    });
  });
});

describe("parseStreamedJson", () => {
  it("parses a bare JSON object", () => {
    expect(parseStreamedJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a code fence", () => {
    expect(parseStreamedJson("```json\n{\"a\":2}\n```")).toEqual({ a: 2 });
  });

  it("extracts embedded JSON from prose", () => {
    expect(parseStreamedJson("Here is the answer:\n{\"a\":3}\nDone.")).toEqual({ a: 3 });
  });

  it("returns null when no JSON is present", () => {
    expect(parseStreamedJson("no json here")).toBeNull();
  });
});
