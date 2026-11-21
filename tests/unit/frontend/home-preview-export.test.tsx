import { it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import HomeTab from "@/components/dashboard/HomeTab";

// Provider mocks keep this an export of the actual HomeTab component without
// pulling in auth/router/network. Mirrors tests/unit/frontend/home-phase4.test.tsx.
vi.mock("@/lib/services/api", () => ({
  api: {
    preparationIntelligenceScope: vi.fn(async (scope: string) => {
      if (scope === "pulse") {
        return {
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
      }
      if (scope === "tasks") return { studyTasks: [], unfinishedActivities: [] };
      return {
        subjectPerformance: [], weakTopics: [], masteryDistribution: [],
        mistakes: { totalMistakes: 0, unmastered: 0, struggling: 0, reviewing: 0, improving: 0, mastered: 0, bySubject: [] },
        recentResults: [],
        recommendations: [],
      };
    }),
    spotlight: vi.fn(async () => []),
  },
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/ecosystem-ctx", () => ({
  useEcosystem: () => ({ ecosystem: "BCS", setEcosystem: vi.fn() }),
}));
vi.mock("@/lib/ai-launcher", () => ({ launchAI: vi.fn() }));
vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({ user: { name: "Preview Scholar", examTarget: "BCS" } }),
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

it("exports actual HomeTab with the existing redesign fixture and provider mocks", async () => {
  const { container } = render(<HomeTab />);
  await screen.findByRole("region", { name: "Preparation pulse" });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); });
  expect((await screen.findAllByText(/70%/)).length).toBeGreaterThan(0);
  const outPath = join(tmpdir(), "opencode", "home-preview-markup.html");
  mkdirSync(join(tmpdir(), "opencode"), { recursive: true });
  writeFileSync(outPath, container.innerHTML);
  expect(container.innerHTML.length).toBeGreaterThan(0);
});
