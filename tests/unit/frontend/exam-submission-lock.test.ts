import { describe, it, expect, beforeEach } from "vitest";
import { 
  submitExamAttempt, 
  getSubmissionLock, 
  setSubmissionLock 
} from "@/lib/services/exam-submission";
import { api } from "@/lib/services/api";

vi.mock("@/lib/services/api", () => ({
  api: {
    submitExam: vi.fn(),
  },
}));

describe("Exam Submission Global Lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSubmissionLock(false);
  });

  it("prevents concurrent submissions using the global lock", async () => {
    // Setup a slow API response to hold the lock
    vi.mocked(api.submitExam).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ result: {} }), 100))
    );

    const params = {
      attemptId: "11111111-2222-4333-8444-555555555555",
      questionIds: [1],
      durationSec: 60,
      answers: { 1: "ক" },
    };

    // Start first submission
    const firstCall = submitExamAttempt(params);
    
    // Immediate second call should be blocked by the lock
    await expect(submitExamAttempt(params)).rejects.toThrow("ইতিমধ্যেই জমা দেওয়া হচ্ছে");

    await firstCall;
    
    // Lock should be released after completion
    expect(getSubmissionLock()).toBe(false);
  });

  it("releases lock even after failure", async () => {
    vi.mocked(api.submitExam).mockRejectedValue(new Error("Network Error"));

    const params = {
      attemptId: "11111111-2222-4333-8444-555555555555",
      questionIds: [1],
      durationSec: 60,
      answers: { 1: "ক" },
    };

    await expect(submitExamAttempt(params)).rejects.toThrow();
    expect(getSubmissionLock()).toBe(false);
  });
});
