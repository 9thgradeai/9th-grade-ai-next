import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomeCoach from "@/components/dashboard/ai/HomeCoach";
import PracticeDrillOverlay from "@/components/dashboard/ai/PracticeDrillOverlay";
import { api } from "@/lib/services/api";

const components = vi.hoisted(() => ({
  runAgentTurn: vi.fn(),
}));

vi.mock("@/lib/services/ai", () => ({
  runAgentTurn: (...args: unknown[]) => components.runAgentTurn(...args),
  AIError: class extends Error {},
}));

vi.mock("@/lib/services/api", () => ({
  api: { questions: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HomeCoach (home-tab AI coach)", () => {
  it("renders the coach card with the run button and Bengali label", () => {
    render(<HomeCoach />);
    expect(screen.getByText("AI স্টাডি কোচ")).toBeInTheDocument();
    expect(screen.getByText("বলো আমার কী করা উচিত")).toBeInTheDocument();
  });

  it("runs an agent turn on click; streams prose and shows a mock source label", async () => {
    components.runAgentTurn.mockImplementation(async ({ onDelta, onBlock }) => {
      onDelta?.("পরবর্তী ধাপ:");
      onBlock?.({
        type: "study_recommendation",
        title: "দুর্বল টপিক অনুশীলন",
        reason: "আপনার দুর্বল টপিক",
        actions: [{ type: "practice", label: "Practice 5 questions", params: { questionIds: [1, 2, 3, 4, 5] } }],
      });
      return {
        conversationId: "c1",
        runId: "r1",
        provider: "mock",
        model: "",
        steps: 1,
        text: "পরবর্তী ধাপ: অনুশীলন শুরু করুন।",
        blocks: [
          {
            type: "study_recommendation",
            title: "দুর্বল টপিক অনুশীলন",
            reason: "আপনার দুর্বল টপিক",
            actions: [{ type: "practice", label: "Practice 5 questions", params: { questionIds: [1, 2, 3, 4, 5] } }],
          },
        ],
        source: "mock",
      };
    });

    render(<HomeCoach />);
    fireEvent.click(screen.getByText("বলো আমার কী করা উচিত"));

    await waitFor(() => {
      expect(components.runAgentTurn).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("পরবর্তী ধাপ: অনুশীলন শুরু করুন।")).toBeInTheDocument();
    expect(screen.getByText(/source: mock/)).toBeInTheDocument();
    // Action chips from AgentBlocks are rendered too.
    await waitFor(() => {
      expect(screen.getByText("Practice 5 questions")).toBeInTheDocument();
    });
  });
});

describe("PracticeDrillOverlay (AI practice-drill modal)", () => {
  it("opens on ai:start-practice and mounts the QuestionDrill with loaded questions", async () => {
    const questions = [
      {
        id: 1,
        subjectId: 1,
        subject: "Math",
        topic: "Algebra",
        subtopic: "",
        question: "What is 2+2?",
        options: ["A", "B", "C", "D"],
        correctAnswer: "A",
        explanation: "",
        difficulty: "MEDIUM",
        year: null,
        sourceExam: null,
        bcsTerm: null,
      },
    ] as never;
    vi.mocked(api.questions).mockResolvedValue(questions);

    render(<PracticeDrillOverlay />);
    window.dispatchEvent(
      new CustomEvent("ai:start-practice", {
        detail: { questionIds: [1], title: "Weak-topic practice" },
      }),
    );

    await waitFor(() => {
      expect(api.questions).toHaveBeenCalledWith({ ids: [1] });
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText("Weak-topic practice")).toBeInTheDocument();
    expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
  });

  it("shows an error state when questions fail to load", async () => {
    vi.mocked(api.questions).mockRejectedValue(new Error("boom"));

    render(<PracticeDrillOverlay />);
    window.dispatchEvent(
      new CustomEvent("ai:start-practice", { detail: { questionIds: [9] } }),
    );

    await waitFor(() => {
      expect(screen.getByText(/প্রশ্ন লোড করা যায়নি/)).toBeInTheDocument();
    });
  });
});