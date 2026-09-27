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

describe("read-cache scoping (Phase 3.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateCache();
  });

  it("a bookmark toggle invalidates only its own scope, not other tabs", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/bookmarks") && !url.includes("?")) {
        return Promise.resolve(jsonResponse({ bookmarked: [1] }));
      }
      if (url === "/api/bookmarks" || url.startsWith("/api/bookmarks?")) {
        return Promise.resolve(jsonResponse({ bookmarked: [1] }));
      }
      return Promise.resolve(jsonResponse({ stats: { points: 10 } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.bookmarks();
    await api.dashboardStats();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Mutation POST succeeds.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve(jsonResponse({ bookmarked: true }));
        return fetchMock(url);
      }),
    );
    await api.toggleBookmark(9);

    // Bookmarks refetch (scope invalidated), stats serve from cache (untouched).
    const fetchMock2 = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/bookmarks")) {
        return Promise.resolve(jsonResponse({ bookmarked: [1, 9] }));
      }
      return Promise.resolve(jsonResponse({ stats: { points: 10 } }));
    });
    vi.stubGlobal("fetch", fetchMock2);
    const callsBefore = fetchMock2.mock.calls.length;
    await api.bookmarks();
    await api.dashboardStats();
    const calls = fetchMock2.mock.calls.length - callsBefore;
    expect(calls).toBe(1); // only bookmarks refetched
    expect(fetchMock2.mock.calls[callsBefore]?.[0]).toContain("/api/bookmarks");
  });

  it("explicit prefix invalidation drops only matching paths", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        jsonResponse(url.startsWith("/api/study-plan") ? { tasks: [] } : { stats: {} }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.studyPlan();
    await api.dashboardStats();
    const base = fetchMock.mock.calls.length;

    invalidateCache("/api/study-plan");
    await api.studyPlan();
    await api.dashboardStats();
    // studyPlan refetched, dashboardStats served from cache.
    expect(fetchMock.mock.calls.length - base).toBe(1);
  });

  it("throws INVALID_RESPONSE on a 200 with a drifted envelope (fail fast, not silent undefined)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stat: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.dashboardStats()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
