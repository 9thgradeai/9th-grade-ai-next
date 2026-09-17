import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitExamAttempt, recoverPendingSubmission } from "@/lib/services/exam-submission";
import { api } from "@/lib/services/api";

vi.mock("@/lib/services/api", () => ({
  api: {
    submitExam: vi.fn(),
  },
}));

const ATTEMPT = "11111111-2222-4333-8444-555555555555";
const STORAGE_KEY = "ninth-grade-ai:mock-test:active";
const params = {
  attemptId: ATTEMPT,
  questionIds: [1, 2],
  durationSec: 60,
  answers: { 1: "ক", 2: "খ" },
  storageKey: STORAGE_KEY,
};

function submittedResult(outcome: "submitted" | "resumed" = "submitted") {
  return { attemptId: ATTEMPT, outcome };
}

describe("Exam submission — rendezvous, no-wedge, crash recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("joins the in-flight submission instead of rejecting a double click", async () => {
    vi.mocked(api.submitExam).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(submittedResult()), 50),
        ),
    );

    const first = submitExamAttempt(params);
    // A second click lands while the first is in-flight — it must resolve
    // with the same outcome, never a "already submitting" rejection.
    const second = submitExamAttempt(params);

    const [a, b] = await Promise.all([first, second]);
    expect(a.result).toEqual(b.result);
    expect(vi.mocked(api.submitExam)).toHaveBeenCalledTimes(1);
  });

  it("stays healthy after a failure (no wedge) and reuses the attempt id", async () => {
    vi.mocked(api.submitExam).mockRejectedValueOnce(new Error("Network Error"));

    await expect(submitExamAttempt(params)).rejects.toThrow();

    vi.mocked(api.submitExam).mockResolvedValue(submittedResult("resumed"));
    const res = await submitExamAttempt(params);

    expect(res.outcome).toBe("resumed");
    expect(vi.mocked(api.submitExam)).toHaveBeenCalledTimes(2);
    // Both attempts used the SAME idempotency key — the server dedupes.
    for (const call of vi.mocked(api.submitExam).mock.calls) {
      expect(call[0].attemptId).toBe(ATTEMPT);
    }
  });

  it("keeps the pending payload on failure and clears it after recovery", async () => {
    vi.mocked(api.submitExam).mockRejectedValueOnce(new Error("Network Error"));
    await expect(submitExamAttempt(params)).rejects.toThrow();

    // A later reload calls recoverPendingSubmission → resolves via the server
    // snapshot (idempotent re-send, no re-grading).
    vi.mocked(api.submitExam).mockResolvedValue(submittedResult("resumed"));
    const recovered = await recoverPendingSubmission(STORAGE_KEY);

    expect(recovered).not.toBeNull();
    expect(recovered?.outcome).toBe("resumed");
    expect(vi.mocked(api.submitExam).mock.calls[1][0].attemptId).toBe(ATTEMPT);

    // Success clears the pending entry — a second recovery is a no-op.
    expect(await recoverPendingSubmission(STORAGE_KEY)).toBeNull();
  });

  it("recovery is a no-op when nothing is pending", async () => {
    expect(await recoverPendingSubmission(STORAGE_KEY)).toBeNull();
    expect(vi.mocked(api.submitExam)).not.toHaveBeenCalled();
  });

  it("does not resurrect an attempt from a different exam storage key", async () => {
    vi.mocked(api.submitExam).mockRejectedValueOnce(new Error("Network Error"));
    await expect(submitExamAttempt(params)).rejects.toThrow();

    vi.mocked(api.submitExam).mockResolvedValue(submittedResult());
    // Recovering under a DIFFERENT key finds no pending payload.
    expect(await recoverPendingSubmission("ninth-grade-ai:exam:active")).toBeNull();
  });
});