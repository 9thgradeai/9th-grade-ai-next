import { describe, expect, it } from "vitest";
import {
  orchestratorMeta,
  normalizeLegacyMode,
  ghostPrompt,
  selectionPrompt,
  isMockProvider,
  ORCHESTRATOR_MODES,
} from "@/lib/ai-orchestrator";

describe("ai orchestrator (Phase 2)", () => {
  it("exposes five honest modes with endpoints", () => {
    expect(ORCHESTRATOR_MODES).toHaveLength(5);
    for (const m of ORCHESTRATOR_MODES) {
      expect(m.endpoint.startsWith("/api/ai/")).toBe(true);
    }
  });

  it("maps legacy assistant/agent to coach", () => {
    expect(normalizeLegacyMode("assistant")).toBe("coach");
    expect(normalizeLegacyMode("agent")).toBe("coach");
    expect(normalizeLegacyMode("tutor")).toBe("tutor");
    expect(normalizeLegacyMode("bogus")).toBe("tutor");
  });

  it("tutor is Socratic, solver is not", () => {
    expect(orchestratorMeta("tutor").socratic).toBe(true);
    expect(orchestratorMeta("solve").socratic).toBe(false);
    expect(orchestratorMeta("voice").voice).toBe(true);
  });

  it("builds ghost + selection prompts without inventing data", () => {
    expect(ghostPrompt("mock")).toContain("MCQ");
    const p = selectionPrompt("quiz-me", "বাংলাদেশের রাজধানী?");
    expect(p).toContain("MCQ");
    expect(p).toContain("বাংলাদেশের রাজধানী?");
  });

  it("detects mock provider for disclosure", () => {
    expect(isMockProvider("mock")).toBe(true);
    expect(isMockProvider("anthropic")).toBe(false);
  });
});
