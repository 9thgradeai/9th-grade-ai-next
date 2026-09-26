import { describe, it, expect, vi, afterEach } from "vitest";
import { api, invalidateCache } from "@/lib/services/api";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => data,
  } as unknown as Response;
}

describe("preparationIntelligenceScope caching (Phase 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateCache();
  });

  it("serves a repeat scope from cache without a second network call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ intelligence: { streak: 4 } }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await api.preparationIntelligenceScope("pulse");
    const second = await api.preparationIntelligenceScope("pulse");
    expect(first).toEqual({ streak: 4 });
    expect(second).toEqual({ streak: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches scopes independently", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const scope = new URL(url, "https://app.example.com").searchParams.get("scope");
      return Promise.resolve(jsonResponse({ intelligence: { scope } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.preparationIntelligenceScope("pulse");
    await api.preparationIntelligenceScope("tasks");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches after invalidation (e.g. task toggle mutation)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ intelligence: { streak: 1 } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.preparationIntelligenceScope("tasks");
    invalidateCache();
    await api.preparationIntelligenceScope("tasks");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
