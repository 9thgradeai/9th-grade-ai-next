import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

// Exam-ecosystem context: switching must clear cross-tab intents so stale
// subjects never leak across ecosystems, and the choice must persist.

function Probe() {
  const examContext = useDashboardStore((s) => s.examContext);
  const practiceIntent = useDashboardStore((s) => s.practiceIntent);
  const mistakeIntent = useDashboardStore((s) => s.mistakeIntent);
  return (
    <>
      <span data-testid="ctx">{examContext ?? "null"}</span>
      <span data-testid="practice">{practiceIntent ? JSON.stringify(practiceIntent) : "null"}</span>
      <span data-testid="mistake">{mistakeIntent ? JSON.stringify(mistakeIntent) : "null"}</span>
    </>
  );
}

function Controls() {
  const setExamContext = useDashboardStore((s) => s.setExamContext);
  const setPracticeIntent = useDashboardStore((s) => s.setPracticeIntent);
  const setMistakeIntent = useDashboardStore((s) => s.setMistakeIntent);
  const resetStore = useDashboardStore((s) => s.resetStore);
  return (
    <>
      <button onClick={() => setExamContext("bcs")}>set-bcs</button>
      <button onClick={() => setExamContext("bank")}>set-bank</button>
      <button onClick={() => setExamContext(null)}>set-all</button>
      <button onClick={() => setPracticeIntent({ subject: "Math", mode: "quick" })}>
        set-practice
      </button>
      <button onClick={() => setMistakeIntent({ subject: "Bangla" })}>set-mistake</button>
      <button onClick={() => resetStore()}>reset</button>
    </>
  );
}

describe("dashboard store exam context", () => {
  beforeEach(() => {
    localStorage.clear();
    render(
      <>
        <Probe />
        <Controls />
      </>,
    );
    fireEvent.click(screen.getByText("reset"));
  });

  it("defaults to null (all exams)", () => {
    expect(screen.getByTestId("ctx").textContent).toBe("null");
  });

  it("persists the selected exam context", () => {
    fireEvent.click(screen.getByText("set-bcs"));
    expect(screen.getByTestId("ctx").textContent).toBe("bcs");
    const raw = localStorage.getItem("9th_grade_ai_store_v2");
    expect(raw).toContain('"examContext":"bcs"');
  });

  it("clears cross-tab intents when the exam context changes", () => {
    fireEvent.click(screen.getByText("set-practice"));
    fireEvent.click(screen.getByText("set-mistake"));
    expect(screen.getByTestId("practice").textContent).not.toBe("null");
    expect(screen.getByTestId("mistake").textContent).not.toBe("null");

    fireEvent.click(screen.getByText("set-bank"));

    expect(screen.getByTestId("ctx").textContent).toBe("bank");
    expect(screen.getByTestId("practice").textContent).toBe("null");
    expect(screen.getByTestId("mistake").textContent).toBe("null");
  });

  it("preserves intents when re-selecting the same context", () => {
    fireEvent.click(screen.getByText("set-bcs"));
    fireEvent.click(screen.getByText("set-practice"));
    fireEvent.click(screen.getByText("set-bcs"));

    expect(screen.getByTestId("ctx").textContent).toBe("bcs");
    expect(screen.getByTestId("practice").textContent).not.toBe("null");
  });

  it("can return to the all-exams context", () => {
    fireEvent.click(screen.getByText("set-bcs"));
    fireEvent.click(screen.getByText("set-all"));
    expect(screen.getByTestId("ctx").textContent).toBe("null");
  });
});
