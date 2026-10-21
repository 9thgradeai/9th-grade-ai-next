import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveModelCandidates } from "~backend/ai/providers/registry";
import { validateMockTestOutput } from "~backend/ai/validation/outputs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("provider registry mock-only warning", () => {
  it("warns once naming the missing keys when nothing is configured", () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const first = resolveModelCandidates("tutor");
      expect(first.map((s) => s.name)).toEqual(["mock"]);
      const second = resolveModelCandidates("assistant");
      expect(second.map((s) => s.name)).toEqual(["mock"]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("GROQ_API_KEY");
      expect(warn.mock.calls[0][0]).toContain("ANTHROPIC_API_KEY");
    } finally {
      warn.mockRestore();
    }
  });

  it("offers groq and stays silent when the key is set", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sels = resolveModelCandidates("tutor");
      expect(sels[0]?.name).toBe("groq");
      expect(sels.map((s) => s.name)).toContain("mock");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("mock provider honours the mock-test schema", () => {
  it("emits parseable questions when resolved with mockTask: 'mock-test'", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mock = resolveModelCandidates("solver", { mockTask: "mock-test" })
        .find((s) => s.name === "mock");
      expect(mock).toBeDefined();
      const out = await mock!.provider.generate({ system: "s", messages: [] });
      // The regression: without the distinct mock seed the mock answers with
      // the solver schema, validateMockTestOutput drops every question, and
      // the AI mock tab renders an empty test (no submit button) whenever no
      // API key is configured — dev, CI, and keyless deployments.
      const result = validateMockTestOutput(out.text, "fallback", 10);
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions.every((q) => q.options.length >= 2)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("still answers the solver schema for plain solver resolution", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mock = resolveModelCandidates("solver").find((s) => s.name === "mock");
      expect(mock).toBeDefined();
      const out = await mock!.provider.generate({ system: "s", messages: [] });
      // Solver-shaped JSON — validateMockTestOutput must NOT find questions.
      expect(validateMockTestOutput(out.text, "fallback", 10).questions).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
