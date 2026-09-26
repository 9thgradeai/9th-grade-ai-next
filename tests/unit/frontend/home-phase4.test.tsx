import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomeTab from "@/components/dashboard/HomeTab";

const components = vi.hoisted(() => ({
  preparationIntelligenceScope: vi.fn(),
  toggleStudyTask: vi.fn(),
}));

vi.mock("@/lib/services/api", () => ({
  api: {
    preparationIntelligenceScope: (...args: unknown[]) =>
      components.preparationIntelligenceScope(...args),
    toggleStudyTask: components.toggleStudyTask,
  },
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/ai-launcher", () => ({
  launchAI: vi.fn(),
}));

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({ user: { name: "Test Scholar", examTarget: "BCS" } }),
}));

vi.mock("@/lib/toast-ctx", () => ({
  useToastSafe: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/lang-ctx", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lang-ctx")>("@/lib/lang-ctx");
  return { ...actual, useLanguage: () => ({ lang: "en" as const }) };
});

vi.mock("@/lib/store-ctx/dashboard", () => ({
  useDashboardStore: () => ({
    setActiveTab: vi.fn(),
    setPracticeIntent: vi.fn(),
    setMistakeIntent: vi.fn(),
    setQuestionBankFilters: vi.fn(),
  }),
}));

const TODAY = new Date().toLocaleDateString("en-US", { weekday: "long" });

const pulse = {
  overall: {
    totalAttempts: 10, totalCorrect: 7, totalWrong: 3, accuracy: 70,
    questionsAttempted: 10, points: 100, rank: 1, streak: 3,
    flashcardsReviewed: 0, aiQuestionsAsked: 0, examsAttempted: 0, studyTimeSec: 600,
  },
  activity: [],
  period: {
    currentAccuracy: 70, previousAccuracy: 70, accuracyDelta: 0,
    currentAttempts: 10, previousAttempts: 0, attemptsDelta: 10,
    currentCorrect: 7, previousCorrect: 0, correctDelta: 7,
    currentStudyTimeSec: 600, previousStudyTimeSec: 0, studyTimeDeltaSec: 600,
  },
  streak: 3,
  flashcardsDue: 0,
  nextExam: null,
  dailyQuizAvailable: false,
};

const tasks = {
  studyTasks: [
    { id: 1, title: "Solve 20 MCQs", subject: "Math", day: TODAY, duration: 20, priority: "high", completed: false },
  ],
  unfinishedActivities: [],
};

const analytics = {
  subjectPerformance: [],
  weakTopics: [],
  masteryDistribution: [],
  mistakes: { totalMistakes: 0, unmastered: 0, struggling: 0, reviewing: 0, improving: 0, mastered: 0, bySubject: [] },
  recentResults: [],
  recommendations: [{ id: "daily-warmup", priority: "medium", target: "practice" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  components.preparationIntelligenceScope.mockImplementation(async (scope: string) => {
    if (scope === "pulse") return pulse;
    if (scope === "tasks") return tasks;
    return analytics;
  });
});

describe("HomeTab Phase 4 — background revalidation", () => {
  it("keeps rendered sections on ai:refresh-home instead of flashing skeletons", async () => {
    render(<HomeTab />);
    await screen.findByText("Today's Mission");

    const callsBefore = components.preparationIntelligenceScope.mock.calls.length;
    fireEvent(window, new CustomEvent("ai:refresh-home"));

    // Data stays on screen (no skeleton flash) while scopes refetch.
    expect(screen.getByText("Today's Mission")).toBeInTheDocument();
    await waitFor(() => {
      expect(components.preparationIntelligenceScope.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(screen.getByText("Today's Mission")).toBeInTheDocument();
  });
});

describe("HomeTab Phase 4 — shortcuts dialog", () => {
  it("opens on ? with a labelled dialog and closes on Escape", async () => {
    render(<HomeTab />);
    await screen.findByText("Today's Mission");

    fireEvent.keyDown(window, { key: "?" });
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Quick practice")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
    });
  });

  it("opens from the header ? button", async () => {
    render(<HomeTab />);
    await screen.findByText("Today's Mission");
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
  });
});
