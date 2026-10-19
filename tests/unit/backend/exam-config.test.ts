import { describe, it, expect, beforeEach } from "vitest";
import {
  BCS_PRELIMINARY_CONFIG,
  BANK_PRELIMINARY_CONFIG,
  clearExamConfigValidationCache,
  collectConfigIds,
  getExamConfig,
  getExamConfigValidation,
  getExamConfigVersion,
  isExamEcosystemCode,
  listExamConfigVersions,
  listExamEcosystems,
  resolveExamConfig,
  subjectPaths,
  summarizeExamConfig,
  validateExamConfig,
  type ExamConfig,
  type SubjectNode,
} from "~backend/services/exam-config";

beforeEach(() => {
  clearExamConfigValidationCache();
});

describe("canonical configs", () => {
  it("BCS Preliminary encodes the official 200-mark paper", () => {
    const c = BCS_PRELIMINARY_CONFIG;
    expect(c.examCode).toBe("BCS");
    expect(c.totalMarks).toBe(200);
    expect(c.totalQuestions).toBe(200);
    expect(c.scoring).toEqual({ marksPerQuestion: 1, penaltyPerWrong: 0.5, marksForUnanswered: 0 });
    const sum = c.subjects.reduce((a, s) => a + s.marks, 0);
    expect(sum).toBe(200);
  });

  it("Bangladesh Bank encodes the 100-mark paper", () => {
    const c = BANK_PRELIMINARY_CONFIG;
    expect(c.examCode).toBe("BANGLADESH_BANK");
    expect(c.totalMarks).toBe(100);
    expect(c.totalQuestions).toBe(100);
    expect(c.scoring.penaltyPerWrong).toBe(0.25);
    expect(c.subjects.reduce((a, s) => a + s.marks, 0)).toBe(100);
  });

  it("both configurations pass validation with no errors", () => {
    for (const c of [BCS_PRELIMINARY_CONFIG, BANK_PRELIMINARY_CONFIG]) {
      const result = validateExamConfig(c);
      expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("never marks an inferred node as carrying official marks", () => {
    const walk = (nodes: SubjectNode["children"]) => {
      for (const n of nodes) {
        if (n.allocationSource === "inferred") expect(n.marks).toBeUndefined();
        walk(n.children);
      }
    };
    for (const c of [BCS_PRELIMINARY_CONFIG, BANK_PRELIMINARY_CONFIG]) {
      for (const s of c.subjects) walk(s.children);
    }
  });

  it("records the International Affairs reconciliation note rather than hiding it", () => {
    expect(BCS_PRELIMINARY_CONFIG.notes.some((n) => /Reconciliation/i.test(n))).toBe(true);
  });
});

describe("validateExamConfig", () => {
  const base: ExamConfig = {
    examCode: "BCS",
    version: 1,
    label: "t",
    labelBn: "t",
    provenance: "OFFICIAL",
    reviewStatus: "draft",
    scoring: { marksPerQuestion: 1, penaltyPerWrong: 0.5, marksForUnanswered: 0 },
    totalMarks: 10,
    totalQuestions: 10,
    subjects: [
      {
        id: "s1",
        nameBn: "s",
        nameEn: "s",
        marks: 10,
        allocationSource: "official",
        rootSegment: "root",
        children: [{ id: "t1", nameBn: "t", paths: ["root/a"], marks: 10, allocationSource: "official", children: [] }],
      },
    ],
    notes: [],
  };

  it("accepts a minimal well-formed config", () => {
    expect(validateExamConfig(base).valid).toBe(true);
  });

  it("flags an exam-total mismatch", () => {
    const r = validateExamConfig({ ...base, totalMarks: 11 });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "EXAM_TOTAL_MISMATCH")).toBe(true);
  });

  it("flags duplicate ids", () => {
    const r = validateExamConfig({
      ...base,
      subjects: [
        base.subjects[0],
        { ...base.subjects[0], id: "s1", marks: 0 },
      ],
      totalMarks: 10,
    });
    expect(r.issues.some((i) => i.code === "DUPLICATE_ID")).toBe(true);
  });

  it("flags a leaf with no paths", () => {
    const r = validateExamConfig({
      ...base,
      subjects: [
        {
          ...base.subjects[0],
          children: [{ id: "orphan", nameBn: "o", paths: [], marks: 10, allocationSource: "official", children: [] }],
        },
      ],
    });
    expect(r.issues.some((i) => i.code === "TOPIC_ORPHAN")).toBe(true);
  });

  it("flags inferred nodes that carry marks", () => {
    const r = validateExamConfig({
      ...base,
      subjects: [
        {
          ...base.subjects[0],
          children: [{ id: "t1", nameBn: "t", paths: ["root/a"], marks: 10, allocationSource: "inferred", children: [] }],
        },
      ],
    });
    expect(r.issues.some((i) => i.code === "INFERRED_MARKS_PRESENT")).toBe(true);
  });

  it("flags an invalid scoring policy", () => {
    const r = validateExamConfig({
      ...base,
      scoring: { marksPerQuestion: 0, penaltyPerWrong: -1, marksForUnanswered: 0 },
    });
    expect(r.valid).toBe(false);
    expect(r.issues.filter((i) => i.code === "SCORING_INVALID").length).toBeGreaterThanOrEqual(2);
  });

  it("flags parent/child mark disagreement", () => {
    const r = validateExamConfig({
      ...base,
      subjects: [
        {
          ...base.subjects[0],
          marks: 10,
          children: [
            { id: "t1", nameBn: "a", paths: ["root/a"], marks: 4, allocationSource: "official", children: [] },
            { id: "t2", nameBn: "b", paths: ["root/b"], marks: 4, allocationSource: "official", children: [] },
          ],
        },
      ],
    });
    expect(r.issues.some((i) => i.code === "SUBJECT_CHILD_MARKS_MISMATCH")).toBe(true);
  });
});

describe("registry", () => {
  it("narrows ecosystem codes", () => {
    expect(isExamEcosystemCode("BCS")).toBe(true);
    expect(isExamEcosystemCode("BANGLADESH_BANK")).toBe(true);
    expect(isExamEcosystemCode("bcs")).toBe(false);
    expect(isExamEcosystemCode(undefined)).toBe(false);
  });

  it("returns the active config by code", () => {
    expect(getExamConfig("BCS")?.totalMarks).toBe(200);
    expect(getExamConfig("BANGLADESH_BANK")?.totalMarks).toBe(100);
    expect(getExamConfig("NOPE")).toBeNull();
  });

  it("lists versions and resolves historical versions", () => {
    expect(listExamConfigVersions("BCS")).toEqual([1]);
    expect(getExamConfigVersion("BCS", 1)?.examCode).toBe("BCS");
    expect(getExamConfigVersion("BCS", 99)).toBeNull();
  });

  it("lists ecosystems and summarizes a config", () => {
    expect(listExamEcosystems().sort()).toEqual(["BANGLADESH_BANK", "BCS"]);
    const s = summarizeExamConfig(BCS_PRELIMINARY_CONFIG);
    expect(s.subjectCount).toBe(10);
    expect(s.totalMarks).toBe(200);
  });

  it("caches validation results and exposes an invalidation seam", () => {
    const first = getExamConfigValidation(BCS_PRELIMINARY_CONFIG);
    const second = getExamConfigValidation(BCS_PRELIMINARY_CONFIG);
    expect(first).toBe(second); // same cached object
    clearExamConfigValidationCache();
    const third = getExamConfigValidation(BCS_PRELIMINARY_CONFIG);
    expect(third).not.toBe(first);
  });

  it("resolveExamConfig returns config + validation", () => {
    const r = resolveExamConfig("BCS");
    expect(r?.config.examCode).toBe("BCS");
    expect(r?.validation.valid).toBe(true);
    expect(resolveExamConfig("NOPE")).toBeNull();
  });

  it("collects unique ids and subject paths", () => {
    const ids = collectConfigIds(BCS_PRELIMINARY_CONFIG);
    expect(new Set(ids).size).toBe(ids.length);
    const paths = subjectPaths(BCS_PRELIMINARY_CONFIG.subjects[3]);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => typeof p === "string")).toBe(true);
  });
});
