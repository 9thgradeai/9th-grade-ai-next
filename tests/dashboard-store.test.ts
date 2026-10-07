import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

describe("dashboard store persistence + intents", () => {
  beforeEach(() => {
    localStorage.clear();
    const { result } = renderHook(() => useDashboardStore((s) => s.resetStore));
    act(() => result.current());
  });

  it("does not persist activeTab (URL owns it)", () => {
    const { result } = renderHook(() => useDashboardStore((s) => s.setActiveTab));
    act(() => result.current("practice"));
    const raw = localStorage.getItem("9th_grade_ai_store_v2");
    expect(raw === null || !raw.includes('"activeTab"')).toBe(true);
  });

  it("clears intents when exam context changes", () => {
    const { result } = renderHook(() =>
      useDashboardStore((s) => ({
        setPracticeIntent: s.setPracticeIntent,
        setMistakeIntent: s.setMistakeIntent,
        setExamContext: s.setExamContext,
        practiceIntent: s.practiceIntent,
        mistakeIntent: s.mistakeIntent,
        examContext: s.examContext,
      })),
    );
    act(() => {
      result.current.setPracticeIntent({ mode: "mock" });
      result.current.setMistakeIntent({ subject: "math" });
    });
    act(() => result.current.setExamContext("bcs"));
    expect(result.current.examContext).toBe("bcs");
    expect(result.current.practiceIntent).toBeNull();
    expect(result.current.mistakeIntent).toBeNull();
  });

  it("clearIntents wipes both intents", () => {
    const { result } = renderHook(() =>
      useDashboardStore((s) => ({
        setPracticeIntent: s.setPracticeIntent,
        clearIntents: s.clearIntents,
        practiceIntent: s.practiceIntent,
      })),
    );
    act(() => result.current.setPracticeIntent({ mode: "quick" }));
    act(() => result.current.clearIntents());
    expect(result.current.practiceIntent).toBeNull();
  });

  it("store defaults to home tab", () => {
    const { result } = renderHook(() => useDashboardStore((s) => s.activeTab));
    expect(result.current).toBe("home");
  });

  it("setActiveTab clears intents by default", () => {
    const { result } = renderHook(() =>
      useDashboardStore((s) => ({
        setPracticeIntent: s.setPracticeIntent,
        setActiveTab: s.setActiveTab,
        practiceIntent: s.practiceIntent,
      })),
    );
    act(() => result.current.setPracticeIntent({ mode: "mock" }));
    act(() => result.current.setActiveTab("progress"));
    expect(result.current.practiceIntent).toBeNull();
  });

  it("setActiveTab keeps intents with keepIntent for URL handoffs", () => {
    const { result } = renderHook(() =>
      useDashboardStore((s) => ({
        setPracticeIntent: s.setPracticeIntent,
        setActiveTab: s.setActiveTab,
        practiceIntent: s.practiceIntent,
      })),
    );
    act(() => result.current.setPracticeIntent({ mode: "quick" }));
    act(() => result.current.setActiveTab("practice", { keepIntent: true }));
    expect(result.current.practiceIntent).toEqual({ mode: "quick" });
  });
});
