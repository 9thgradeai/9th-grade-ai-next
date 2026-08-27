import { describe, it, expect } from "vitest";
import { buildSolverSystem } from "~backend/ai/prompts/solver";
import { buildTutorSystem } from "~backend/ai/prompts/tutor";
import { buildAssistantSystem } from "~backend/ai/prompts/assistant";

const baseCtx = {
  exam: "BCS",
  subject: { id: 1, nameBn: "গণিত", nameEn: "Math" },
  topic: { id: 1, name: "Algebra" },
  question: { question: "2+2?", subject: "Math", topic: "Arithmetic" },
  memories: [],
  learningProfile: { weakTopics: ["X"], strongTopics: ["Y"] },
  retrievedKnowledge: undefined,
  webResults: [],
} as any;

describe("AI prompt builders", () => {
  it("buildSolverSystem includes subject + domain block", () => {
    const s = buildSolverSystem(baseCtx, "DOMAIN");
    expect(s).toContain("Math");
    expect(s).toContain("DOMAIN");
    expect(buildSolverSystem({} as any)).toContain("9th-Grade AI");
  });

  it("buildTutorSystem renders learning context branches", () => {
    const s = buildTutorSystem(baseCtx, "WEB", "KB");
    expect(s).toContain("BCS");
    expect(s).toContain("WEB");
    expect(s).toContain("KB");
    expect(buildTutorSystem({ memories: [], learningProfile: { weakTopics: [], strongTopics: [] } } as any)).toContain("You are 9th-Grade AI");
  });

  it("buildAssistantSystem includes memory + web context", () => {
    const s = buildAssistantSystem(baseCtx, "WEB");
    expect(s).toContain("WEB");
    expect(buildAssistantSystem({ memories: [], learningProfile: { weakTopics: [], strongTopics: [] } } as any)).toContain("9th-Grade AI");
  });
});
