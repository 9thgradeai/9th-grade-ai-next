import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuestionDrill from "@/components/dashboard/QuestionDrill";
import { api } from "@/lib/services/api";

vi.mock("@/lib/services/api", () => ({
  api: {
    submitPractice: vi.fn(),
  },
}));

function makeQuestions() {
  return [
    {
      id: 1,
      subjectId: 1,
      subject: "Math",
      topic: "Algebra",
      subtopic: "",
      question: "What is 2+2?",
      options: ["A", "B", "C", "D"],
      correctAnswer: "A",
      explanation: "Two plus two equals four.",
      difficulty: "MEDIUM",
      year: null,
      sourceExam: "BCS",
      bcsTerm: null,
    },
    {
      id: 2,
      subjectId: 1,
      subject: "Math",
      topic: "Algebra",
      subtopic: "",
      question: "What is 3+3?",
      options: ["A", "B", "C", "D"],
      correctAnswer: "C",
      explanation: "Three plus three equals six.",
      difficulty: "MEDIUM",
      year: null,
      sourceExam: "BCS",
      bcsTerm: null,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("QuestionDrill (§13 mastery feedback)", () => {
  it("shows 'Improved!' when answering a mistake correctly", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 1,
      total: 1,
      score: 100,
      pointsEarned: 10,
      feedback: {
        1: { masteryStatus: "REVIEWING", isMistake: true, justMastered: false },
      },
    } as never);

    render(<QuestionDrill questions={makeQuestions()} />);

    fireEvent.click(screen.getByText("A"));
    fireEvent.click(screen.getByText("জমা দিন"));

    await waitFor(() => {
      expect(screen.getByText("Improved!")).toBeTruthy();
    });
  });

  it("shows 'Keep Working On It' when answering wrong again", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 0,
      total: 1,
      score: 0,
      pointsEarned: 0,
      feedback: {
        1: { masteryStatus: "STRUGGLING", isMistake: true, justMastered: false },
      },
    } as never);

    render(<QuestionDrill questions={makeQuestions()} />);

    fireEvent.click(screen.getByText("B"));
    fireEvent.click(screen.getByText("জমা দিন"));

    await waitFor(() => {
      expect(screen.getByText("Keep Working On It")).toBeTruthy();
    });
  });

  it("shows 'Mastered!' when the attempt promotes a question to mastered", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 1,
      total: 1,
      score: 100,
      pointsEarned: 10,
      feedback: {
        1: { masteryStatus: "MASTERED", isMistake: false, justMastered: true },
      },
    } as never);

    render(<QuestionDrill questions={makeQuestions()} />);

    fireEvent.click(screen.getByText("A"));
    fireEvent.click(screen.getByText("জমা দিন"));

    await waitFor(() => {
      expect(screen.getByText("Mastered!")).toBeTruthy();
    });
  });

  it("calls onComplete with mastery feedback once the set is finished", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 1,
      total: 1,
      score: 100,
      pointsEarned: 10,
      feedback: {
        1: { masteryStatus: "REVIEWING", isMistake: true, justMastered: false },
        2: { masteryStatus: "STRUGGLING", isMistake: true, justMastered: false },
      },
    } as never);

    const onComplete = vi.fn();
    render(<QuestionDrill questions={makeQuestions()} onComplete={onComplete} />);

    // Answer question 1 correctly, advance
    fireEvent.click(screen.getByText("A"));
    fireEvent.click(screen.getByText("জমা দিন"));
    await waitFor(() => expect(screen.getByText("Improved!")).toBeTruthy());
    fireEvent.click(screen.getByText("পরবর্তী"));

    // Answer question 2 wrongly, which finishes the set
    fireEvent.click(screen.getByText("B"));
    fireEvent.click(screen.getByText("জমা দিন"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    const called = onComplete.mock.calls[0][0];
    expect(called).toHaveLength(2);
    expect(called[0].correct).toBe(true);
    expect(called[0].masteryStatus).toBe("REVIEWING");
    expect(called[1].correct).toBe(false);
  });
});
