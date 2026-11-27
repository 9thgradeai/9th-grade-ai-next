import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADAPTIVE_EXAM_KEY, EXAM_PERSIST_KEYS } from "@/lib/exam-persist";
import { TABS, NAV_GROUPS, type TabId } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";
import { isAdaptiveExamV2Enabled } from "@/lib/flags";

const { submitMock, statusMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock("@/lib/services/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, code = "UNKNOWN", status = 500) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      void code;
    }
  },
  adaptiveExam: {
    submit: (...args: unknown[]) => submitMock(...args),
    submissionStatus: (...args: unknown[]) => statusMock(...args),
  },
}));

import {
  clearPendingSubmission,
  loadPendingSubmission,
  persistPendingSubmission,
  recoverAdaptiveSubmission,
  submitAdaptiveExam,
} from "@/lib/services/adaptive-exam-submission";

const SCORE = {
  attemptId: "attempt-1",
  paperId: "paper-1",
  correct: 1,
  incorrect: 0,
  unanswered: 0,
  total: 1,
  obtainedMarks: 1,
  maxMarks: 1,
  accuracy: 1,
  percentage: 100,
  subjectPerformance: [],
  topicPerformance: [],
  timeMetrics: { elapsedSec: 10 },
};

const PARAMS = {
  attemptId: "attempt-1",
  paperId: "paper-1",
  answers: { 1: "A" as const },
  durationSec: 10,
  idempotencyKey: "idem-1",
};

describe("standalone adaptive exam tab registration", () => {
  it("registers the tab, nav group and icon without duplicating the real-exam panel", () => {
    const tab = TABS.find((entry) => entry.id === "adaptive-exam");
    expect(tab?.label).toBe("ADAPTIVE EXAM");
    expect(NAV_GROUPS.some((group) => group.ids.includes("adaptive-exam" as TabId))).toBe(true);
    expect(TAB_ICONS["adaptive-exam"]).toBeDefined();
    expect(EXAM_PERSIST_KEYS).toContain(ADAPTIVE_EXAM_KEY);
  });

  it("defaults the flag to enabled and hides only on an explicit false", () => {
    const original = process.env.NEXT_PUBLIC_ADAPTIVE_EXAM_V2;
    try {
      delete process.env.NEXT_PUBLIC_ADAPTIVE_EXAM_V2;
      expect(isAdaptiveExamV2Enabled()).toBe(true);
      process.env.NEXT_PUBLIC_ADAPTIVE_EXAM_V2 = "false";
      expect(isAdaptiveExamV2Enabled()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_ADAPTIVE_EXAM_V2;
      else process.env.NEXT_PUBLIC_ADAPTIVE_EXAM_V2 = original;
    }
  });
});

describe("crash-safe adaptive submission", () => {
  beforeEach(() => {
    window.localStorage.clear();
    submitMock.mockReset();
    statusMock.mockReset();
  });

  it("persists the pending payload before a submit and clears it only after success", async () => {
    submitMock.mockResolvedValue({ score: SCORE });
    const result = await submitAdaptiveExam(PARAMS);
    expect(result).toEqual({ outcome: "submitted", score: SCORE });
    expect(submitMock).toHaveBeenCalledWith("attempt-1", {
      paperId: "paper-1",
      answers: [{ position: 1, option: "A" }],
      durationSec: 10,
      idempotencyKey: "idem-1",
    });
    expect(loadPendingSubmission()).toBeNull();
  });

  it("keeps the pending payload on network failure and joins concurrent clicks", async () => {
    let resolve!: (value: { score: typeof SCORE }) => void;
    submitMock.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = submitAdaptiveExam(PARAMS);
    const second = submitAdaptiveExam(PARAMS);
    expect(second).toBe(first);
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(loadPendingSubmission()?.idempotencyKey).toBe("idem-1");
    resolve({ score: SCORE });
    await Promise.all([first, second]);
    expect(loadPendingSubmission()).toBeNull();
  });

  it("recovers an already-completed submit from the authoritative status", async () => {
    persistPendingSubmission(PARAMS);
    statusMock.mockResolvedValue({ status: "COMPLETED", score: SCORE });
    const recovered = await recoverAdaptiveSubmission();
    expect(recovered).toEqual({ outcome: "resumed", score: SCORE });
    expect(loadPendingSubmission()).toBeNull();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("retries an interrupted submit with the original idempotency key", async () => {
    persistPendingSubmission(PARAMS);
    statusMock.mockResolvedValue({ status: "IN_PROGRESS", score: null });
    submitMock.mockResolvedValue({ score: SCORE });
    const recovered = await recoverAdaptiveSubmission();
    expect(recovered).toEqual({ outcome: "resumed", score: SCORE });
    expect(submitMock.mock.calls[0][1]).toMatchObject({ idempotencyKey: "idem-1" });
    expect(loadPendingSubmission()).toBeNull();
  });

  it("discards an expired attempt and malformed pending payloads", async () => {
    persistPendingSubmission(PARAMS);
    statusMock.mockResolvedValue({ status: "EXPIRED", score: null });
    expect(await recoverAdaptiveSubmission()).toEqual({ outcome: "expired" });
    expect(loadPendingSubmission()).toBeNull();

    window.localStorage.setItem(
      "ninth-grade-ai:adaptive-exam:pending-submit",
      JSON.stringify({ attemptId: "a", paperId: "p" }),
    );
    expect(loadPendingSubmission()).toBeNull();
    clearPendingSubmission();
  });
});
