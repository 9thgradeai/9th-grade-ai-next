import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveModelCandidates } from "~backend/ai/providers/registry";

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
