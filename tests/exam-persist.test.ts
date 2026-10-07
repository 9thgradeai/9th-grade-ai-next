import { describe, it, expect, beforeEach } from "vitest";
import {
  QUICK_EXAM_KEY,
  MOCK_EXAM_KEY,
  CUSTOM_EXAM_KEY,
  loadExamSnapshot,
  saveExamSnapshot,
  dropExamSnapshot,
  clearOtherExams,
} from "@/lib/exam-persist";

describe("exam-persist central manager", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a valid snapshot", () => {
    saveExamSnapshot(QUICK_EXAM_KEY, { questions: [{ id: 1 }], answers: {} });
    expect(loadExamSnapshot(QUICK_EXAM_KEY)?.questions).toHaveLength(1);
  });

  it("drops corrupt payloads", () => {
    localStorage.setItem(MOCK_EXAM_KEY, "{nope");
    expect(loadExamSnapshot(MOCK_EXAM_KEY)).toBeNull();
    expect(localStorage.getItem(MOCK_EXAM_KEY)).toBeNull();
  });

  it("drops payloads without questions", () => {
    localStorage.setItem(CUSTOM_EXAM_KEY, JSON.stringify({ answers: {} }));
    expect(loadExamSnapshot(CUSTOM_EXAM_KEY)).toBeNull();
  });

  it("clearOtherExams keeps only the started mode", () => {
    saveExamSnapshot(QUICK_EXAM_KEY, { questions: [{ id: 1 }] });
    saveExamSnapshot(MOCK_EXAM_KEY, { questions: [{ id: 2 }] });
    saveExamSnapshot(CUSTOM_EXAM_KEY, { questions: [{ id: 3 }] });
    clearOtherExams(MOCK_EXAM_KEY);
    expect(loadExamSnapshot(MOCK_EXAM_KEY)?.questions).toHaveLength(1);
    expect(localStorage.getItem(QUICK_EXAM_KEY)).toBeNull();
    expect(localStorage.getItem(CUSTOM_EXAM_KEY)).toBeNull();
  });

  it("dropExamSnapshot is silent when empty", () => {
    expect(() => dropExamSnapshot(QUICK_EXAM_KEY)).not.toThrow();
  });
});
