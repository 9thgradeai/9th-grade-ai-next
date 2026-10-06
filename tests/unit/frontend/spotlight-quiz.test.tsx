import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import SpotlightQuiz from "@/components/dashboard/SpotlightQuiz";
import { EcosystemProvider } from "@/lib/ecosystem-ctx";
import { api } from "@/lib/services/api";

vi.mock("@/lib/services/api", () => ({
  api: {
    spotlight: vi.fn(),
  },
}));

function makeQuestion(id: number, subject: string, question: string, correct: string) {
  return {
    id,
    subjectId: id,
    subject,
    topic: "Topic",
    subtopic: "",
    question,
    options: ["ক", "খ", correct, "ঘ"],
    correctAnswer: correct,
    explanation: "",
    difficulty: "MEDIUM",
    year: null,
    sourceExam: "BCS",
    bcsTerm: null,
    questionType: "SINGLE_CHOICE",
    correctAnswers: [],
    statements: [],
    media: [],
    paperId: null,
    examId: null,
    questionNumber: null,
    rawMath: false,
  };
}

const BATCH = [
  makeQuestion(1, "বাংলা", "বাংলা প্রশ্ন?", "গ"),
  makeQuestion(2, "English", "English question?", "গ"),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.spotlight).mockResolvedValue(BATCH as never);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSpotlight() {
  return render(
    <EcosystemProvider>
      <SpotlightQuiz />
    </EcosystemProvider>,
  );
}

describe("SpotlightQuiz (Home rotating MCQ)", () => {
  it("renders a database question with its subject chip", async () => {
    renderSpotlight();
    expect(await screen.findByText("বাংলা প্রশ্ন?")).toBeInTheDocument();
    expect(screen.getByText("বাংলা")).toBeInTheDocument();
    expect(vi.mocked(api.spotlight)).toHaveBeenCalledWith(
      expect.objectContaining({ ecosystem: "BCS" }),
    );
  });

  it("shows an instant green verdict on the correct option", async () => {
    renderSpotlight();
    await screen.findByText("বাংলা প্রশ্ন?");

    // Fake timers only from here: the reveal delay becomes controllable while
    // the already-rendered content stays put.
    vi.useFakeTimers();
    // Tapping the right option locks at once with a green correct signal…
    fireEvent.click(screen.getByText("গ"));
    expect(screen.getByText(/✓ সঠিক!/)).toBeInTheDocument();
    expect(screen.getAllByText(/সঠিক/).length).toBeGreaterThan(0);
    // …then the cycle moves on to the next subject.
    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.getByText("English question?")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("shows a red verdict on a wrong pick and calls out the right answer", async () => {
    renderSpotlight();
    await screen.findByText("বাংলা প্রশ্ন?");

    vi.useFakeTimers();
    fireEvent.click(screen.getByText("ক"));
    expect(screen.getByText(/✗ ভুল/)).toBeInTheDocument();
    // The correct row carries the green badge even though another was picked.
    expect(screen.getAllByText(/সঠিক/).length).toBeGreaterThan(0);
  });

  it("adds a calibration note when confidence was rated before picking", async () => {
    renderSpotlight();
    await screen.findByText("বাংলা প্রশ্ন?");

    vi.useFakeTimers();
    fireEvent.click(screen.getByText("100%"));
    fireEvent.click(screen.getByText("গ"));
    expect(screen.getByText(/✓ সঠিক!/)).toBeInTheDocument();
    expect(screen.getByText(/ক্যালিব্রেশন/)).toBeInTheDocument();
  });

  it("skip button moves on without answering", async () => {
    renderSpotlight();
    await screen.findByText("বাংলা প্রশ্ন?");

    fireEvent.click(screen.getByText(/এড়িয়ে যান/));
    expect(await screen.findByText("English question?")).toBeInTheDocument();
  });

  it("shows a retry state when the bank returns nothing", async () => {
    vi.mocked(api.spotlight).mockResolvedValue([]);
    renderSpotlight();
    expect(await screen.findByText(/কোনো প্রশ্ন পাওয়া যায়নি/)).toBeInTheDocument();
  });
});
