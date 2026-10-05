import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/lang-ctx";
import StreakEngine from "@/components/dashboard/command-center/StreakEngine";
import TodayMission from "@/components/dashboard/command-center/TodayMission";

const intel = {
  overall: { totalAttempts: 0, totalCorrect: 0, totalWrong: 0, accuracy: 0, questionsAttempted: 0, points: 0, rank: 0, streak: 0, flashcardsReviewed: 0, aiQuestionsAsked: 0, examsAttempted: 0, studyTimeSec: 0 },
  recommendations: [],
  studyTasks: [],
} as never;

describe("Sprint 1 — one streak voice + one mission voice", () => {
  it("StreakEngine unifies streak, heat, freeze and level", () => {
    render(
      <LanguageProvider>
        <StreakEngine streak={7} activeDays={[true, true, false, true, false, false, true]} labels={["a", "b", "c", "d", "e", "f", "g"]} solved={120} accuracy={72} />
      </LanguageProvider>,
    );
    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(screen.getByText(/Lv 2/)).toBeInTheDocument();
    expect(screen.getByLabelText("Streak Freeze available")).toBeInTheDocument();
  });

  it("TodayMission renders the AI brief as its narrative header", () => {
    render(
      <LanguageProvider>
        <TodayMission
          intelligence={intel}
          onStartPractice={() => {}}
          onStartMistakes={() => {}}
          onReviewFlashcards={() => {}}
          onStartDailyQuiz={() => {}}
          brief={<p>Test brief voice</p>}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Test brief voice")).toBeInTheDocument();
    expect(screen.getByText(/preparation journey starts here|প্রস্তুতি যাত্রা/)).toBeInTheDocument();
  });
});
