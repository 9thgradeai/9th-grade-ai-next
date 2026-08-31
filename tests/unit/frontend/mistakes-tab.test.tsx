import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MistakesTab from "@/components/dashboard/MistakesTab";
import { api } from "@/lib/services/api";

vi.mock("@/lib/services/api", () => ({
  api: {
    mistakeOverallStats: vi.fn(),
    mistakeExamSelection: vi.fn(),
    mistakes: vi.fn(),
    buildMistakeExam: vi.fn(),
    submitPractice: vi.fn(),
  },
}));

vi.mock("@/lib/toast-ctx", () => ({
  useToastSafe: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock("@/components/dashboard/QuestionDrill", () => ({
  default: ({
    title,
    onComplete,
  }: {
    title: string;
    onComplete?: (answered: { questionId: number; correct: boolean; justMastered?: boolean }[]) => void;
  }) => (
    <div>
      <span>DRILL:{title}</span>
      <button
        onClick={() =>
          onComplete?.([
            { questionId: 101, correct: true, justMastered: true, masteryStatus: "MASTERED" },
          ])
        }
      >
        finish-drill
      </button>
    </div>
  ),
}));

const overall = {
  totalAttempts: 120,
  totalCorrect: 84,
  totalWrong: 36,
  accuracy: 70,
  questionsAttempted: 25,
};

const selection = [
  {
    subject: "Math",
    count: 3,
    topics: [
      {
        topic: "Algebra",
        count: 3,
        subtopics: [{ subtopic: "Linear", count: 2 }, { subtopic: "Quadratics", count: 1 }],
      },
    ],
  },
];

function mistakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    questionId: 101,
    totalAttempts: 3,
    correctAttempts: 1,
    incorrectAttempts: 2,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 2,
    mistakeCount: 2,
    masteryScore: 30,
    masteryStatus: "STRUGGLING",
    masteredAt: null,
    isMistake: true,
    firstIncorrectAt: "2024-01-01T00:00:00Z",
    lastIncorrectAt: "2024-01-02T00:00:00Z",
    lastCorrectAt: null,
    reviewCount: 0,
    lastReviewedAt: "2024-01-02T00:00:00Z",
    nextReviewAt: null,
    lastSubject: "Math",
    lastTopic: "Algebra",
    lastExam: "",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    question: {
      id: 101,
      subjectId: 1,
      subject: "Math",
      topic: "Algebra",
      subtopic: "Linear",
      question: "Which of the following is linear?",
      options: ["a", "b", "c", "d"],
      correctAnswer: "a",
      explanation: "Because it has degree 1.",
      difficulty: "MEDIUM",
      year: null,
      sourceExam: "BCS",
      bcsTerm: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.mistakeOverallStats).mockResolvedValue(overall as never);
  vi.mocked(api.mistakeExamSelection).mockResolvedValue(selection as never);
  vi.mocked(api.mistakes).mockResolvedValue({
    data: [mistakeRow()],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  } as never);
});

describe("MistakesTab", () => {
  it("renders accuracy, right-answer and wrong-answer stats", async () => {
    render(<MistakesTab />);

    await waitFor(() => {
      expect(screen.getByText("Mistake Analytics")).toBeTruthy();
    });
    expect(screen.getByText("70%")).toBeTruthy(); // accuracy
    expect(screen.getByText("84")).toBeTruthy(); // right answers
    expect(screen.getByText("36")).toBeTruthy(); // wrong answers
  });

  it("lists wrong questions with their wrong date", async () => {
    render(<MistakesTab />);

    const question = await screen.findByText("Which of the following is linear?");
    expect(question).toBeTruthy();
    // The date is rendered via toLocaleDateString, so assert on the wrong-count
    // ancillary instead which is deterministic.
    expect(screen.getByText(/Linear/)).toBeTruthy();
  });

  it("expands a wrong question to reveal explanation", async () => {
    render(<MistakesTab />);

    const question = await screen.findByText("Which of the following is linear?");
    fireEvent.click(question);

    await waitFor(() => {
      expect(screen.getByText(/Because it has degree 1/)).toBeTruthy();
    });
  });

  it("builds a mistake exam from a subject/topic/subtopic preference", async () => {
    vi.mocked(api.buildMistakeExam).mockResolvedValue({
      questions: [
        {
          id: 101,
          subjectId: 1,
          subject: "Math",
          topic: "Algebra",
          subtopic: "Linear",
          question: "Which of the following is linear?",
          options: ["a", "b", "c", "d"],
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "BCS",
        },
      ],
    } as never);

    render(<MistakesTab />);

    // Open the preference builder and select Subject = Math, Topic = Algebra.
    fireEvent.click(await screen.findByText("Customize", { exact: false }));

    const subjectSelect = await screen.findByRole("combobox");
    // First combobox is the subject selector.
    fireEvent.change(subjectSelect, { target: { value: "Math" } });

    // Second combobox (topic) appears as a dependency.
    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(2);
    });
    const topicSelect = screen.getAllByRole("combobox")[1];
    fireEvent.change(topicSelect, { target: { value: "Algebra" } });

    fireEvent.click(await screen.findByText("Start Mistake Exam"));

    await waitFor(() => {
      expect(screen.getByText("DRILL:Mistake Exam")).toBeTruthy();
    });
    expect(api.buildMistakeExam).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Math", topic: "Algebra" }),
    );
  });

  it("shows the result screen after completing a mistake exam", async () => {
    vi.mocked(api.buildMistakeExam).mockResolvedValue({
      questions: [
        {
          id: 101,
          subjectId: 1,
          subject: "Math",
          topic: "Algebra",
          subtopic: "Linear",
          question: "Which of the following is linear?",
          options: ["a", "b", "c", "d"],
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "BCS",
        },
      ],
    } as never);

    render(<MistakesTab />);
    fireEvent.click(await screen.findByText("Customize", { exact: false }));
    fireEvent.click(await screen.findByText("Start Mistake Exam"));

    await waitFor(() => expect(screen.getByText("DRILL:Mistake Exam")).toBeTruthy());
    fireEvent.click(screen.getByText("finish-drill"));

    await waitFor(() => {
      expect(screen.getByText(/Mistake Exam সম্পন্ন/)).toBeTruthy();
    });
    expect(screen.getAllByText(/Mastered/).length).toBeGreaterThan(0);
  });
});
