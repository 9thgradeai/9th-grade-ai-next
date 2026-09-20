// tests/unit/frontend/useExamEngine.test.ts
// Tests for the shared useExamEngine hook

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useExamEngine, OPTION_LABELS, formatTime, scrollDashboardTop } from "@/lib/hooks/useExamEngine";

// Mock the API module
vi.mock("@/lib/services/api", () => ({
  api: {
    examConfig: vi.fn().mockResolvedValue([]),
  },
}));

// Mock useAuth
vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

describe("useExamEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with default state", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    expect(result.current.configLoading).toBe(true);
    expect(result.current.configError).toBeNull();
    expect(result.current.subjects).toEqual([]);
    expect(result.current.answers).toEqual({});
    expect(result.current.lockedQuestions.size).toBe(0);
    expect(result.current.submitting).toBe(false);
    expect(result.current.submitError).toBeNull();
    expect(result.current.showUnansweredConfirm).toBe(false);
    expect(result.current.answeredCount).toBe(0);
  });

  it("should compute selectedSubjects correctly", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    // No subjects selected initially
    expect(result.current.selectedSubjects).toEqual([]);
    expect(result.current.availableTotal).toBe(0);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.insufficient).toBe(false);
  });

  it("should lock question after selecting answer", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    act(() => {
      result.current.selectAnswer(1, "A");
    });

    expect(result.current.answers[1]).toBe("A");
    expect(result.current.lockedQuestions.has(1)).toBe(true);
    expect(result.current.answeredCount).toBe(1);
  });

  it("should not allow re-selecting a locked question", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    act(() => {
      result.current.selectAnswer(1, "A");
    });

    act(() => {
      result.current.selectAnswer(1, "B");
    });

    // Should still be "A" (locked)
    expect(result.current.answers[1]).toBe("A");
  });

  it("should show unanswered confirm when submit requested with unanswered", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    const submitFn = vi.fn();

    act(() => {
      result.current.handleSubmitRequest(5, submitFn);
    });

    expect(result.current.showUnansweredConfirm).toBe(true);
    expect(submitFn).not.toHaveBeenCalled();
  });

  it("should call submit directly when all questions answered", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    const submitFn = vi.fn();

    act(() => {
      result.current.selectAnswer(1, "A");
      result.current.selectAnswer(2, "B");
    });

    act(() => {
      result.current.handleSubmitRequest(2, submitFn);
    });

    expect(result.current.showUnansweredConfirm).toBe(false);
    expect(submitFn).toHaveBeenCalled();
  });

  it("should finalizeSubmit dismiss confirm and call submit", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    const submitFn = vi.fn();

    act(() => {
      result.current.setShowUnansweredConfirm(true);
    });

    act(() => {
      result.current.finalizeSubmit(submitFn);
    });

    expect(result.current.showUnansweredConfirm).toBe(false);
    expect(submitFn).toHaveBeenCalled();
  });

  it("should add beforeunload guard when submitting", () => {
    const { result } = renderHook(() =>
      useExamEngine({ ecosystem: "BCS" }),
    );

    const addSpy = vi.spyOn(window, "addEventListener");

    act(() => {
      result.current.setSubmitting(true);
    });

    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
  });
});

describe("formatTime", () => {
  it("should format zero seconds", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  it("should format minutes and seconds", () => {
    expect(formatTime(65)).toBe("01:05");
  });

  it("should pad single digits", () => {
    expect(formatTime(309)).toBe("05:09");
  });

  it("should format exactly 60 minutes", () => {
    expect(formatTime(3600)).toBe("60:00");
  });
});

describe("OPTION_LABELS", () => {
  it("should have 6 labels", () => {
    expect(OPTION_LABELS).toHaveLength(6);
  });

  it("should start with A", () => {
    expect(OPTION_LABELS[0]).toBe("A");
  });

  it("should end with F", () => {
    expect(OPTION_LABELS[5]).toBe("F");
  });
});
