import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWeb } from "../../../app/api/ai/_search";

describe("web search (Tavily)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty block when no TAVILY_API_KEY is set", async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await searchWeb("What is the capital of Bangladesh?");
    expect(result.results).toBe(0);
    expect(result.block).toBe("");
  });

  it("returns an empty block when Tavily fails", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const result = await searchWeb("any question");
    expect(result.results).toBe(0);
    expect(result.block).toBe("");
  });

  it("formats retrieved results into a grounding block", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Dhaka — Wikipedia",
              url: "https://en.wikipedia.org/wiki/Dhaka",
              content: "Dhaka is the capital of Bangladesh.",
            },
          ],
        }),
      }),
    );

    const result = await searchWeb("capital of Bangladesh");
    expect(result.results).toBe(1);
    expect(result.block).toContain("[WEB 1]");
    expect(result.block).toContain("Dhaka — Wikipedia");
    expect(result.block).toContain("https://en.wikipedia.org/wiki/Dhaka");
    expect(result.block).toContain("Dhaka is the capital of Bangladesh.");
  });

  it("caps results and snippet length", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: Array.from({ length: 10 }, (_, i) => ({
            title: `Result ${i}`,
            url: `https://example.com/${i}`,
            content: "x".repeat(5000),
          })),
        }),
      }),
    );

    const result = await searchWeb("query");
    expect(result.results).toBe(5);
    expect(result.block).not.toContain("[WEB 6]");
  });
});