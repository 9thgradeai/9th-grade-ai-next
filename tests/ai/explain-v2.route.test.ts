// Route-level contract tests for POST /api/ai/explain-v2.
// Auth, feature flag, validation, no-store headers, and error mapping.

// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("~backend/services/user", () => ({
  getUserIdFromRequest: vi.fn(),
}));
vi.mock("~backend/rate-limit", () => ({
  enforceAiQuotas: vi.fn(async () => undefined),
}));
vi.mock("~backend/ai/explain-engine/orchestrator", () => ({
  generateIndependentExplanation: vi.fn(),
}));

import { POST } from "~app/api/ai/explain-v2/route";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { generateIndependentExplanation } from "~backend/ai/explain-engine/orchestrator";

const mockedUser = vi.mocked(getUserIdFromRequest);
const mockedQuota = vi.mocked(enforceAiQuotas);
const mockedGenerate = vi.mocked(generateIndependentExplanation);

const okResult = {
  verificationStatus: "INDEPENDENTLY_VERIFIED",
  metadata: { provider: "groq+anthropic", model: "a+b" },
} as never;

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ai/explain-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockedUser.mockReset();
  mockedQuota.mockClear();
  mockedGenerate.mockReset();
  mockedGenerate.mockResolvedValue(okResult);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ai/explain-v2", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockedUser.mockResolvedValue(null);
    const res = await post({ questionId: 1 });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("UNAUTHORIZED");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("returns 503 with a stable code when the feature flag is off", async () => {
    mockedUser.mockResolvedValue("user-1");
    vi.stubEnv("AI_EXPLAIN_V2_ENABLED", "off");
    const res = await post({ questionId: 1 });
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("AI_EXPLAIN_V2_DISABLED");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("rejects a missing questionId before calling the engine", async () => {
    mockedUser.mockResolvedValue("user-1");
    const res = await post({ displayOptions: ["a", "b"] });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests", async () => {
    mockedUser.mockResolvedValue("user-1");
    const res = await post(
      { questionId: 1 },
      { origin: "https://evil.example", host: "localhost" },
    );
    expect(res.status).toBe(403);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("accepts a valid request, enforces the quota, and returns no-store data", async () => {
    mockedUser.mockResolvedValue("user-1");
    const res = await post({
      questionId: 42,
      selectedAnswers: ["A"],
      displayOptions: ["A", "B", "C", "D"],
    });
    expect(res.status).toBe(200);
    expect(mockedQuota).toHaveBeenCalledTimes(1);
    expect(mockedGenerate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ questionId: 42, selectedAnswers: ["A"] }),
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-ai-verification")).toBe("INDEPENDENTLY_VERIFIED");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("maps an engine provider failure to 502 with a stable code", async () => {
    mockedUser.mockResolvedValue("user-1");
    const { AppError } = await import("~backend/errors");
    mockedGenerate.mockRejectedValueOnce(
      new AppError(502, "unavailable", "AI_VERIFICATION_UNAVAILABLE"),
    );
    const res = await post({ questionId: 1 });
    expect(res.status).toBe(502);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("AI_VERIFICATION_UNAVAILABLE");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
