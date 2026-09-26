import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TodayMission from "@/components/dashboard/command-center/TodayMission";
import RecommendedActions from "@/components/dashboard/command-center/RecommendedActions";

vi.mock("@/lib/lang-ctx", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lang-ctx")>("@/lib/lang-ctx");
  return { ...actual, useLanguage: () => ({ lang: "en" as const }) };
});

const TODAY = new Date().toLocaleDateString("en-US", { weekday: "long" });

const intelligence = {
  overall: { totalAttempts: 40, accuracy: 70, streak: 3 },
  studyTasks: [
    { id: 1, title: "Solve 20 MCQs", subject: "Math", day: TODAY, duration: 20, priority: "high", completed: true },
    { id: 2, title: "Revise notes", subject: "English", day: TODAY, duration: 15, priority: "medium", completed: false },
  ],
  recommendations: [
    { id: "practice-weak-subject", priority: "high", target: "practice", subject: "Math", accuracy: 55, count: 20 },
    { id: "review-mistakes", priority: "medium", target: "mistakes", count: 6 },
  ],
} as never;

describe("TodayMission shared ring", () => {
  it("renders plan progress through the shared ring gauge", () => {
    render(
      <TodayMission
        intelligence={intelligence}
        onStartPractice={() => {}}
        onStartMistakes={() => {}}
        onReviewFlashcards={() => {}}
        onStartDailyQuiz={() => {}}
      />,
    );
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Today's plan progress — 1\/2/ }),
    ).toBeInTheDocument();
  });
});

describe("RecommendedActions motion treatment", () => {
  it("renders action cards that fire the handler", () => {
    const onAction = vi.fn();
    render(<RecommendedActions intelligence={intelligence} onAction={onAction} />);
    expect(screen.getByText("Recommended for you")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Practice Math/ }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "practice-weak-subject" }));
  });

  it("renders nothing without recommendations", () => {
    const { container } = render(
      <RecommendedActions intelligence={{ recommendations: [] } as never} onAction={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
