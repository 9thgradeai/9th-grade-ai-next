import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "@/lib/services/api";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => data,
  } as unknown as Response;
}

const shortParams = {
  attemptId: "11111111-2222-4333-8444-555555555555",
  questionIds: [1],
  durationSec: 10,
  answers: [{ questionId: 1, selected: "ক" }],
};

describe("api gateway — full-lifecycle timeout + idempotent retries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns a stalled response BODY into a retryable TIMEOUT (not a hang)", async () => {
    // The server returns headers instantly but the body never arrives — the
    // classic "button does nothing forever" failure. The timeout must cover
    // the body read, surface TIMEOUT, and be retried a couple of times.
    const hangingBody = () =>
      new Promise<never>((_, reject) => {
        const err = new Error("aborted") as Error & { name: string };
        err.name = "AbortError";
        reject(err);
      });
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: hangingBody,
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.submitExam(shortParams)).rejects.toMatchObject({
      code: "TIMEOUT",
      status: 408,
    });
    // initial attempt + 2 idempotent retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries transient 5xx and returns the result on the follow-up", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 503))
      .mockResolvedValueOnce(
        jsonResponse({ result: { attemptId: "1", outcome: "submitted" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await api.submitExam(shortParams);
    expect(res.outcome).toBe("submitted");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up retrying against a persistent 5xx and surfaces the error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.submitExam(shortParams)).rejects.toMatchObject({
      code: "HTTP_503",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry non-exam mutations by default (no double-apply risk)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.submitPractice([{ questionId: 1, selected: "ক" }]),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});