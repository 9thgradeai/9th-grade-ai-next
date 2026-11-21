import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VocabTab from "@/components/dashboard/VocabTab";
import { LanguageProvider } from "@/lib/lang-ctx";
import { invalidateCache } from "@/lib/services/api";

function word(id: number, w: string) {
  return {
    id,
    word: w,
    bengaliMeaning: `অর্থ ${w}`,
    partOfSpeech: "Noun",
    verbForms: null,
    synonyms: null,
    antonyms: null,
    exampleSentence: `Example ${w}.`,
    exampleSentenceBn: null,
    context: "",
    mnemonic: "",
    examRelevance: ["BCS"],
    frequency: 5,
    difficulty: "MEDIUM",
    ipa: null,
    audioUrl: null,
    register: null,
    collocations: null,
    wordFamily: null,
    confusables: null,
    progress: null,
  };
}

const WORDS = [word(1, "Abate"), word(2, "Benevolent")];

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
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
          rotatesAt: new Date(Date.now() + 120_000).toISOString(),
          wordOfDay: null,
        }),
      } as Response;
    }
    if (url.startsWith("/api/vocab/words")) {
      return { ok: true, status: 200, json: async () => WORDS } as Response;
    }
    if (url.startsWith("/api/vocab/stats")) {
      return { ok: true, status: 200, json: async () => ({ total: 2, mastered: 0, learning: 0, due: 0, reviewed: 0 }) } as Response;
    }
    if (url.startsWith("/api/vocab/daily")) {
      return { ok: true, status: 200, json: async () => ({ wordsReviewed: 0, totalReviewsToday: 0, correctToday: 0, streak: 0, due: 0, goal: 10, goalSource: "adaptive" }) } as Response;
    }
    if (url.startsWith("/api/vocab/review")) {
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function urlsCalled(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls.map(([input]) =>
    typeof input === "string" ? input : input.toString(),
  );
}

describe("VocabTab review refresh source", () => {
  beforeEach(() => invalidateCache());
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-fetches the full stream after a review instead of the 50-word page", async () => {
    const fetchMock = stubFetch();
    render(
      <LanguageProvider>
        <VocabTab />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: "Abate" });

    const streamCallsBefore = urlsCalled(fetchMock).filter((u) => u.startsWith("/api/vocab/stream")).length;

    fireEvent.click(screen.getByRole("button", { name: /Reveal & Memorize/i }));
    fireEvent.click(screen.getByRole("button", { name: /Good/i }));

    await waitFor(() => {
      const streamCalls = urlsCalled(fetchMock).filter((u) => u.startsWith("/api/vocab/stream"));
      expect(streamCalls.length).toBeGreaterThan(streamCallsBefore);
    });
    // The regression this guards: a post-review call to the paginated words
    // endpoint silently shrank the full stream down to one page.
    expect(urlsCalled(fetchMock).some((u) => u.startsWith("/api/vocab/words"))).toBe(false);
  });
});
