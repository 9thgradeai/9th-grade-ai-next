import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WrongAnswerNotebookTab from "@/components/dashboard/WrongAnswerNotebookTab";
import { api } from "@/lib/services/api";

vi.mock("@/lib/services/api", () => ({
  api: {
    mistakeStats: vi.fn(),
    mistakeSubjects: vi.fn(),
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

const stats = {
  totalMistakes: 5,
  unmastered: 4,
  struggling: 3,
  reviewing: 1,
  improving: 0,
  mastered: 1,
  totalAttempts: 12,
  totalCorrect: 5,
  accuracy: 42,
};

const subjects = [
  { subject: "Math", count: 3, unmastered: 2 },
  { subject: "English", count: 2, unmastered: 2 },
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
      subtopic: "Linear Equation",
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
  vi.mocked(api.mistakeStats).mockResolvedValue(stats as never);
  vi.mocked(api.mistakeSubjects).mockResolvedValue(subjects as never);
  vi.mocked(api.mistakes).mockResolvedValue({
    data: [mistakeRow()],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  } as never);
});

describe("WrongAnswerNotebookTab", () => {
  it("renders summary metrics and mistake list", async () => {
    render(<WrongAnswerNotebookTab />);

    await waitFor(() => {
      expect(screen.getByText("Your Mistakes")).toBeTruthy();
    });

    expect(screen.getByText("5")).toBeTruthy(); // total mistakes
    expect(screen.getByText("4")).toBeTruthy(); // unmastered
    expect(screen.getByText("Which of the following is linear?")).toBeTruthy();
  });

  it("shows empty state when there are no mistakes", async () => {
    vi.mocked(api.mistakeStats).mockResolvedValue({
      ...stats,
      totalMistakes: 0,
      unmastered: 0,
      mastered: 0,
    } as never);
    render(<WrongAnswerNotebookTab />);

    await waitFor(() => {
      expect(screen.getByText("You're doing great!")).toBeTruthy();
    });
  });

  it("expands a mistake to show options and explanation", async () => {
    render(<WrongAnswerNotebookTab />);

    const question = await screen.findByText("Which of the following is linear?");
    fireEvent.click(question);

    await waitFor(() => {
      expect(screen.getByText(/Because it has degree 1/)).toBeTruthy();
    });
  });

  it("builds a mistake exam and enters drill view", async () => {
    vi.mocked(api.buildMistakeExam).mockResolvedValue({
      questions: [
        {
          id: 101,
          subjectId: 1,
          subject: "Math",
          topic: "Algebra",
          subtopic: "",
          question: "Which of the following is linear?",
          options: ["a", "b", "c", "d"],
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "BCS",
        },
      ],
    } as never);

    render(<WrongAnswerNotebookTab />);

    const practiceBtn = await screen.findByText("Practice My Mistakes");
    fireEvent.click(practiceBtn);

    const startBtn = await screen.findByText("Start Practice");
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("DRILL:Mistake Practice")).toBeTruthy();
    });
    expect(api.buildMistakeExam).toHaveBeenCalled();
  });

  it("opens the exam config view from the empty state", async () => {
    vi.mocked(api.mistakeStats).mockResolvedValue({
      ...stats,
      totalMistakes: 0,
      unmastered: 0,
      mastered: 0,
    } as never);
    render(<WrongAnswerNotebookTab />);

    const start = await screen.findByText("Start Practicing");
    fireEvent.click(start);

    await waitFor(() => {
      expect(screen.getByText("Practice My Mistakes")).toBeTruthy();
    });
  });

  it("shows the specialized mistake exam result screen (§14) after a drill", async () => {
    vi.mocked(api.buildMistakeExam).mockResolvedValue({
      questions: [
        {
          id: 101,
          subjectId: 1,
          subject: "Math",
          topic: "Algebra",
          subtopic: "",
          question: "Which of the following is linear?",
          options: ["a", "b", "c", "d"],
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "BCS",
        },
      ],
    } as never);
    vi.mocked(api.submitPractice).mockResolvedValue({
      correct: 1,
      total: 1,
      score: 100,
      pointsEarned: 10,
      feedback: {
        101: { masteryStatus: "MASTERED", isMistake: false, justMastered: true },
      },
    } as never);

    render(<WrongAnswerNotebookTab />);

    const practiceBtn = await screen.findByText("Practice My Mistakes");
    fireEvent.click(practiceBtn);
    fireEvent.click(await screen.findByText("Start Practice"));

    await waitFor(() => expect(screen.getByText("DRILL:Mistake Practice")).toBeTruthy());

    // Complete the drill (mock QuestionDrill invokes onComplete), then verify
    // the specialized mistake-exam result screen (§14) with a mastered summary.
    fireEvent.click(screen.getByText("finish-drill"));

    await waitFor(() => {
      expect(screen.getByText(/Mistake Practice সম্পন্ন/)).toBeTruthy();
    });
    expect(screen.getAllByText(/Mastered/).length).toBeGreaterThan(0);
  });
});
