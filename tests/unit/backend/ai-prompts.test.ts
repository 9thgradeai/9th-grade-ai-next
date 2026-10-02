import { describe, it, expect } from "vitest";
import { buildSolverSystem } from "~backend/ai/prompts/solver";
import { buildTutorSystem } from "~backend/ai/prompts/tutor";
import { buildAssistantSystem } from "~backend/ai/prompts/assistant";
import { buildExplainSystem, buildTopicEpisodicBlock } from "~backend/ai/prompts/explain";
import { buildMockTestSystem } from "~backend/ai/prompts/mockTest";

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

  it("buildExplainSystem appends the episodic block only when provided", () => {
    expect(buildExplainSystem(baseCtx, "DOMAIN")).not.toContain("Learner's History");
    expect(buildExplainSystem(baseCtx, "DOMAIN", "EPISODIC")).toContain("EPISODIC");
  });

  it("buildTopicEpisodicBlock renders counts and flags repeat struggles", () => {
    expect(buildTopicEpisodicBlock("Adverb", [])).toBe("");
    const now = new Date("2026-10-02T12:00:00Z");
    const block = buildTopicEpisodicBlock(
      "Adverb",
      [
        { totalAttempts: 5, correctAttempts: 2, isMistake: true, lastIncorrectAt: new Date("2026-10-01T12:00:00Z") },
        { totalAttempts: 3, correctAttempts: 1, isMistake: true, lastIncorrectAt: new Date("2026-09-28T12:00:00Z") },
        { totalAttempts: 2, correctAttempts: 2, isMistake: false, lastIncorrectAt: null },
      ],
      now,
    );
    expect(block).toContain("Adverb");
    expect(block).toContain("10 attempts");
    expect(block).toContain("50% accuracy");
    expect(block).toContain("2 still marked as mistake");
    expect(block).toContain("1 day(s) ago");
    expect(block).toContain("repeat struggle");
  });

  it("buildTopicEpisodicBlock stays silent about struggles with thin history", () => {
    const block = buildTopicEpisodicBlock(
      "Verb",
      [{ totalAttempts: 1, correctAttempts: 0, isMistake: true, lastIncorrectAt: null }],
      new Date("2026-10-02T12:00:00Z"),
    );
    expect(block).toContain("1 attempts");
    expect(block).not.toContain("repeat struggle");
  });

  it("buildMockTestSystem focuses generation on weak topics when given", () => {
    const plain = buildMockTestSystem(baseCtx, { count: 10 });
    expect(plain).not.toContain("weak topics");
    const focused = buildMockTestSystem(baseCtx, {
      count: 10,
      topics: ["বাংলা → বানান", "English → Adverb"],
    });
    expect(focused).toContain("বাংলা → বানান");
    expect(focused).toContain("English → Adverb");
    expect(focused).toContain("at least half");
  });
});
