import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ScrollPractice from "@/components/dashboard/ScrollPractice";
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

describe("ScrollPractice (MISTAKES tab scrollable drill)", () => {
  it("renders all questions at once in a scrollable list", () => {
    render(<ScrollPractice questions={makeQuestions()} />);

    // Both questions visible simultaneously (single-step, no paging).
    expect(screen.getByText("What is 2+2?")).toBeTruthy();
    expect(screen.getByText("What is 3+3?")).toBeTruthy();
    // Two independent answer rows of A-D options.
    expect(screen.getAllByText("A.")).toHaveLength(2);
    expect(screen.getAllByText("D.")).toHaveLength(2);
    expect(screen.getByText(/0\/2 উত্তর দেওয়া হয়েছে/)).toBeTruthy();
  });

  it("allows answering questions independently and submits all at once", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 1,
      total: 2,
      score: 50,
      pointsEarned: 10,
      feedback: {
        1: { masteryStatus: "REVIEWING", isMistake: true, justMastered: false },
        2: { masteryStatus: "STRUGGLING", isMistake: true, justMastered: false },
      },
    } as never);

    render(<ScrollPractice questions={makeQuestions()} />);

    fireEvent.click(screen.getAllByText("A.")[0]);
    // Answer Q2 wrongly (correct answer is C) so only Q1 shows correct feedback.
    fireEvent.click(screen.getAllByText("B.")[1]);
    fireEvent.click(screen.getByText("সব উত্তর জমা দিন"));

    await waitFor(() => {
      expect(api.submitPractice).toHaveBeenCalledWith([
        { questionId: 1, selected: "A" },
        { questionId: 2, selected: "B" },
      ]);
    });

    // Inline per-question feedback after submission.
    expect(screen.getByText(/সঠিক হয়েছে/)).toBeTruthy();
    expect(screen.getByText(/ভুল হয়েছে/)).toBeTruthy();
    // Score summary in the header: 1/2 ঠিক.
    expect(screen.getByText("1/2 ঠিক")).toBeTruthy();
  });

  it("keeps the submit button disabled until every question is answered", async () => {
    render(<ScrollPractice questions={makeQuestions()} />);

    const submit = screen.getByText("সব উত্তর জমা দিন").closest("button");
    expect(submit?.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getAllByText("B.")[0]);
    fireEvent.click(screen.getAllByText("C.")[1]);

    await waitFor(() => {
      expect(screen.getByText("সব উত্তর জমা দিন").closest("button")?.hasAttribute("disabled")).toBe(false);
    });
  });

  it("reveals explanations inline per question after submission", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 2,
      total: 2,
      score: 100,
      pointsEarned: 10,
      feedback: {
        1: { masteryStatus: "REVIEWING", isMistake: true, justMastered: false },
        2: { masteryStatus: "REVIEWING", isMistake: true, justMastered: false },
      },
    } as never);

    render(<ScrollPractice questions={makeQuestions()} />);

    fireEvent.click(screen.getAllByText("A.")[0]);
    fireEvent.click(screen.getAllByText("C.")[1]);
    fireEvent.click(screen.getByText("সব উত্তর জমা দিন"));

    await waitFor(() => {
      expect(screen.queryAllByText("ব্যাখ্যা").length).toBeGreaterThanOrEqual(2);
    });

    // Two explanations available, one per question.
    expect(screen.getAllByText("ব্যাখ্যা")).toHaveLength(2);

    fireEvent.click(screen.getAllByText("ব্যাখ্যা")[0]);
    await waitFor(() => {
      expect(screen.getByText(/Two plus two equals four/)).toBeTruthy();
    });
  });

  it("calls onComplete with answered records when the user finishes", async () => {
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 2,
      total: 2,
      score: 100,
      pointsEarned: 10,
      feedback: {
        1: { masteryStatus: "MASTERED", isMistake: false, justMastered: true },
        2: { masteryStatus: "REVIEWING", isMistake: true, justMastered: false },
      },
    } as never);

    const onComplete = vi.fn();
    render(<ScrollPractice questions={makeQuestions()} onComplete={onComplete} />);

    fireEvent.click(screen.getAllByText("A.")[0]);
    fireEvent.click(screen.getAllByText("C.")[1]);
    fireEvent.click(screen.getByText("সব উত্তর জমা দিন"));

    await waitFor(() => {
      expect(screen.getByText("রেজাল্ট দেখুন")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("রেজাল্ট দেখুন"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const called = onComplete.mock.calls[0][0];
    expect(called).toHaveLength(2);
    expect(called[0]).toMatchObject({ questionId: 1, correct: true, justMastered: true });
    expect(called[1]).toMatchObject({ questionId: 2, correct: true, justMastered: false });
  });
});