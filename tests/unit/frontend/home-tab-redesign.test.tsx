import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import PreparationPulse from "@/components/dashboard/command-center/PreparationPulse";
import HomeTab from "@/components/dashboard/HomeTab";
import TodayMission, { selectMission } from "@/components/dashboard/command-center/TodayMission";

const components = vi.hoisted(() => ({
  preparationIntelligence: vi.fn(),
  toggleStudyTask: vi.fn(),
  setActiveTab: vi.fn(),
  setPracticeIntent: vi.fn(),
}));

vi.mock("@/lib/services/api", () => ({
  api: {
    preparationIntelligence: components.preparationIntelligence,
    toggleStudyTask: components.toggleStudyTask,
  },
}));

vi.mock("@/lib/ai-launcher", () => ({
  launchAI: vi.fn(),
}));

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({
    user: { name: "Test Scholar", examTarget: "BCS" },
  }),
}));

vi.mock("@/lib/toast-ctx", () => ({
  useToastSafe: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/lang-ctx", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lang-ctx")>("@/lib/lang-ctx");
  return {
    ...actual,
    useLanguage: () => ({ lang: "en" as const }),
  };
});

vi.mock("@/lib/store-ctx/dashboard", () => ({
  useDashboardStore: () => ({
    setActiveTab: components.setActiveTab,
    setPracticeIntent: components.setPracticeIntent,
    setMistakeIntent: vi.fn(),
    setQuestionBankFilters: vi.fn(),
  }),
}));

const intelligenceBase = {
  overall: {
    totalAttempts: 120,
    totalCorrect: 84,
    totalWrong: 36,
    accuracy: 70,
    questionsAttempted: 120,
    points: 840,
    rank: 4,
    streak: 6,
    flashcardsReviewed: 20,
    aiQuestionsAsked: 3,
    examsAttempted: 2,
    studyTimeSec: 7200,
  },
  activity: [
    { date: "2026-09-12", answered: 10, correct: 8, durationSec: 600 },
    { date: "2026-09-13", answered: 5, correct: 4, durationSec: 300 },
  ],
  period: {
    currentAccuracy: 72,
    previousAccuracy: 70,
    accuracyDelta: 2,
    currentAttempts: 60,
    previousAttempts: 50,
    attemptsDelta: 10,
    currentCorrect: 36,
    previousCorrect: 35,
    correctDelta: 1,
    currentStudyTimeSec: 3600,
    previousStudyTimeSec: 3600,
    studyTimeDeltaSec: 0,
  },
  subjectPerformance: [],
  weakTopics: [],
  flashcardsDue: 0,
  streak: 6,
  masteryDistribution: [],
  mistakes: {
    totalMistakes: 12,
    unmastered: 5,
    struggling: 4,
    reviewing: 2,
    improving: 1,
    mastered: 0,
    bySubject: [],
  },
  recentResults: [],
  nextExam: {
    id: 1,
    titleBn: "৪৫ তম বিসিএস প্রিলিমিনারি",
    titleEn: "45th BCS Preliminary",
    examDate: "2026-12-31",
    posts: [],
  } as never,
  studyTasks: [
    { id: 1, title: "Solve 20 MCQs", subject: "বাংলাদেশ বিষয়াবলি", day: "Friday", duration: 20, priority: "high", completed: false },
    { id: 2, title: "Revise flashcards", subject: "English", day: "Friday", duration: 15, priority: "medium", completed: true },
  ],
  unfinishedActivities: [],
  recommendations: [
    {
      id: "daily-warmup",
      priority: "medium" as const,
      target: "practice" as const,
    },
  ],
  dailyQuizAvailable: false,
};

const TodayMissionHarness = (props: { intelligence: never }) => (
  <TodayMission
    intelligence={props.intelligence}
    onStartPractice={vi.fn()}
    onStartMistakes={vi.fn()}
    onReviewFlashcards={vi.fn()}
    onStartDailyQuiz={vi.fn()}
  />
);

describe("TodayMission orbital gauge", () => {
  it("selects the top recommendation as the mission", () => {
    const mission = selectMission(intelligenceBase as never, "en");
    expect(mission?.id).toBe("daily-warmup");
  });

  it("renders orbit from real plan progress (1 of 2 done = 50%)", () => {
    render(<TodayMissionHarness intelligence={intelligenceBase as never} />);
    expect(screen.getByText("Today's plan progress")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 tasks done")).toBeInTheDocument();
  });

  it("shows honest empty orbit when there is no data at all", () => {
    render(<TodayMissionHarness intelligence={null as never} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PreparationPulse metrics", () => {
  it("shows real totals and question activity without a fabricated streak delta", () => {
    render(<PreparationPulse intelligence={intelligenceBase as never} />);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByLabelText("+2 pp vs previous period")).toBeInTheDocument();
    const chart = screen.getByRole("img", { name: "Questions: 2026-09-12: 10, 2026-09-13: 5" });
    expect(chart.children).toHaveLength(2);
    expect(chart.children[0]).toHaveStyle({ height: "100%" });
    expect(chart.children[1]).toHaveStyle({ height: "50%" });
    const streak = screen.getByText("Streak").closest(".preparation-metric") as HTMLElement;
    expect(within(streak).queryByLabelText(/vs previous period/)).not.toBeInTheDocument();
  });

  it("formats study-time comparisons with units", () => {
    render(<PreparationPulse intelligence={{ ...intelligenceBase, period: { ...intelligenceBase.period, studyTimeDeltaSec: -1800 } } as never} />);
    expect(screen.getByLabelText("−30m vs previous period")).toBeInTheDocument();
  });

  it("does not invent a chart when activity is absent", () => {
    render(<PreparationPulse intelligence={{ ...intelligenceBase, activity: [] } as never} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps the honest empty state", () => {
    render(<PreparationPulse intelligence={null} />);
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("HomeTab rearrangement", () => {
  beforeEach(() => {
    components.preparationIntelligence.mockResolvedValue(intelligenceBase);
  });

  it("places compact heading and KPIs before analytics, then mission and recommendations", async () => {
    render(<HomeTab />);
    const pulse = await screen.findByRole("region", { name: "Preparation pulse" });
    const heading = screen.getByRole("heading", { level: 1, name: "Preparation overview" });
    const performance = screen.getByText("Performance Velocity");
    const plan = screen.getByText("Today's Adaptive Plan");
    const mission = screen.getByText("Today's Mission");
    const recommendations = screen.getByText("Recommended for you");
    const ordered = [heading, pulse, performance, plan, mission, recommendations];
    ordered.slice(1).forEach((element, index) => {
      expect(ordered[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    const analytics = performance.closest(".study-home-analytics");
    expect(analytics).toContainElement(plan);
    expect(analytics).not.toContainElement(mission);
    expect(analytics).toHaveClass("xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(heading).toHaveClass("text-xl");
    expect(screen.queryByText("A little more focus. A little further forward.")).not.toBeInTheDocument();
  });

  it("preserves the relocated mission action", async () => {
    render(<HomeTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Start warm-up/ }));
    expect(components.setPracticeIntent).toHaveBeenCalledWith({ mode: "quick" });
    expect(components.setActiveTab).toHaveBeenCalledWith("practice");
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
