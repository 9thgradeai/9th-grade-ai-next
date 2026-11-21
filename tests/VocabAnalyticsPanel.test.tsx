import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import VocabTab from "@/components/dashboard/VocabTab";
import { LanguageProvider } from "@/lib/lang-ctx";
import { invalidateCache } from "@/lib/services/api";

const WORDS = [
  {
    id: 1,
    word: "Abate",
    bengaliMeaning: "কমানো",
    partOfSpeech: "Verb",
    verbForms: null,
    synonyms: null,
    antonyms: null,
    exampleSentence: "Example Abate.",
    exampleSentenceBn: null,
    context: "",
    mnemonic: "",
    examRelevance: ["BCS"],
    frequency: 5,
    difficulty: "MEDIUM",
    progress: null,
  },
];

const ANALYTICS = {
  overview: {
    totalWords: 1,
    wordsLearned: 1,
    wordsMastered: 0,
    masteryRate: 0,
    averageAccuracy: 42,
    totalReviews: 5,
    studyStreak: 1,
  },
  difficultyBreakdown: [],
  posBreakdown: [],
  recentActivity: [],
  topWeakWords: [{ word: "Abate", accuracy: 42, reviews: 5 }],
  weeklyGoalProgress: [],
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      // The analytics route returns the DTO directly — no `{ analytics }` wrap.
      if (url.startsWith("/api/vocab/analytics")) {
        return { ok: true, status: 200, json: async () => ANALYTICS } as Response;
      }
      if (url.startsWith("/api/vocab/stream")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            words: WORDS,
            total: WORDS.length,
            mode: "mixed",
            cursor: 0,
            nextCursor: null,
            slotIndex: 0,
            rotatesAt: new Date(Date.now() + 60000).toISOString(),
            wordOfDay: null,
          }),
        } as Response;
      }
      if (url.startsWith("/api/vocab/words")) {
        return { ok: true, status: 200, json: async () => ({ words: WORDS }) } as Response;
      }
      if (url.startsWith("/api/vocab/stats")) {
        return { ok: true, status: 200, json: async () => ({ total: 1, mastered: 0, learning: 0, due: 0, reviewed: 0 }) } as Response;
      }
      if (url.startsWith("/api/vocab/daily")) {
        return { ok: true, status: 200, json: async () => ({ wordsReviewed: 0, totalReviewsToday: 0, correctToday: 0, streak: 0 }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

describe("VocabTab weakest-words analytics", () => {
  beforeEach(() => {
    invalidateCache();
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the weakest-words panel from the direct analytics DTO", async () => {
    render(
      <LanguageProvider>
        <VocabTab />
      </LanguageProvider>,
    );

    expect(await screen.findByText(/Weakest words/)).toBeInTheDocument();
    expect(screen.getByText(/Abate.*42%/)).toBeInTheDocument();
  });
});
