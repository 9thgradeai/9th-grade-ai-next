import { describe, expect, it } from "vitest";
import { getSeedProfile } from "~backend/services/adaptive-exam/profile-seeds";
import { createQuestionValidationService } from "~backend/services/adaptive-exam/question-validation";
import { createSubjectSpecialistService } from "~backend/services/adaptive-exam/subject-specialist";

describe("adaptive question pipeline", () => {
  it("subject specialist lists supported subjects for BCS", () => {
    const specialist = createSubjectSpecialistService();
    expect(specialist.supportedSubjects("BCS_PRELIMINARY")).toContain("bcs.math");
    const instruction = specialist.instructions("bcs.math", "en", "MEDIUM", "BCS_PRELIMINARY");
    expect(instruction).toContain("bcs.math");
  });

  it("validates a well-formed candidate paper question", async () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing profile");
    const validator = createQuestionValidationService();
    const question = {
      position: 1,
      sourceType: "ORIGINAL" as const,
      subjectId: profile.subjects[0].subjectId,
      subjectName: profile.subjects[0].nameEn,
      topicPath: profile.subjects[0].topics[0]?.topicId ?? "t",
      language: "en" as const,
      difficulty: "MEDIUM" as const,
      questionText: "What is 2+2?",
      options: { A: "3", B: "4", C: "5", D: "6" },
      provenance: { sourceType: "ORIGINAL" as const, provider: "mock", model: "m", promptVersion: "v1" },
      marks: 1,
    };
    const blueprint = {
      totalQuestionCount: 1,
      allocations: [{ subjectId: profile.subjects[0].subjectId, count: 1, language: "en" as const, topics: [{ topicId: profile.subjects[0].topics[0]?.topicId ?? "t", paths: [], count: 1, difficulty: { EASY: 0, MEDIUM: 1, HARD: 0 }, sources: {}, language: "en" as const }] }],
    } as any;
    const report = await validator.validateQuestion(question, blueprint);
    expect(report.outcome).toBe("PASS");
  });

  it("rejects a question with empty text", async () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing profile");
    const validator = createQuestionValidationService();
    const question = {
      position: 1,
      sourceType: "ORIGINAL" as const,
      subjectId: profile.subjects[0].subjectId,
      subjectName: profile.subjects[0].nameEn,
      topicPath: profile.subjects[0].topics[0]?.topicId ?? "t",
      language: "en" as const,
      difficulty: "MEDIUM" as const,
      questionText: "",
      options: { A: "3", B: "4", C: "5", D: "6" },
      provenance: { sourceType: "ORIGINAL" as const },
      marks: 1,
    };
    const blueprint = { totalQuestionCount: 1, allocations: [] } as any;
    const report = await validator.validateQuestion(question, blueprint);
    expect(report.outcome).toBe("REJECTED");
  });
});
