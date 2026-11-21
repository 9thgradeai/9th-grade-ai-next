import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomeTab from "@/components/dashboard/HomeTab";

// The tab now lives at the shared dashboard component; mock its providers the
// same way the other HomeTab suites do so the real component renders in
// isolation (no router/auth/network dependencies).
const components = vi.hoisted(() => ({
  setActiveTab: vi.fn(),
  toggleStudyTask: vi.fn(),
  preparationIntelligenceScope: vi.fn(),
  spotlight: vi.fn(),
  recordRecAccepted: vi.fn(),
}));

vi.mock("@/lib/services/api", () => ({
  api: {
    preparationIntelligenceScope: (...args: unknown[]) =>
      components.preparationIntelligenceScope(...args),
    toggleStudyTask: components.toggleStudyTask,
    spotlight: (...args: unknown[]) => components.spotlight(...args),
    recordRecAccepted: components.recordRecAccepted,
  },
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/ecosystem-ctx", () => ({
  useEcosystem: () => ({ ecosystem: "BCS", setEcosystem: vi.fn() }),
}));

vi.mock("@/lib/ai-launcher", () => ({ launchAI: vi.fn() }));

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
    activeTab: "home",
    setActiveTab: components.setActiveTab,
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
  components.spotlight.mockResolvedValue([]);
  components.toggleStudyTask.mockResolvedValue(undefined);
  components.preparationIntelligenceScope.mockImplementation(async (scope: string) => {
    if (scope === "pulse") return pulse;
    if (scope === "tasks") return tasks;
    return analytics;
  });
});

describe("HomeTab", () => {
  it("preserves the relocated mission action", async () => {
    render(<HomeTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Start warm-up/i }));
    // Mission CTA carries the rec id so completion can be attributed (REC_COMPLETED).
    expect(components.setActiveTab).toHaveBeenCalledWith("practice", {
      practiceIntent: { mode: "quick", subject: undefined, recId: "daily-warmup" },
    });
  });

  it("fires plan task toggle through to api", async () => {
    render(<HomeTab />);
    const toggle = await screen.findByRole("button", { name: "Mark complete" });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(components.toggleStudyTask).toHaveBeenCalledWith(1);
    });
  });
});
