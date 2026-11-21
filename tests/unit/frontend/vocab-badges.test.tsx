import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WordOfDayCard from "@/components/dashboard/vocab/WordOfDayCard";
import { LanguageProvider } from "@/lib/lang-ctx";
import { invalidateCache } from "@/lib/services/api";

function stubWord(difficulty: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/vocab/word-of-the-day")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            word: {
              id: 1,
              word: "Abandon",
              bengaliMeaning: "পরিত্যাগ",
              partOfSpeech: "Verb",
              verbForms: null,
              synonyms: null,
              antonyms: null,
              exampleSentence: "They abandon the plan.",
              exampleSentenceBn: null,
              context: "",
              mnemonic: "mnemonic",
              examRelevance: ["BCS"],
              frequency: 10,
              difficulty,
              slotIndex: 0,
              rotatesAt: new Date(Date.now() + 600_000).toISOString(),
            },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

async function renderBadge(difficulty: string): Promise<HTMLElement> {
  stubWord(difficulty);
  render(
    <LanguageProvider>
      <WordOfDayCard />
    </LanguageProvider>,
  );
  await waitFor(() => expect(screen.getByText("Abandon")).toBeInTheDocument());
  // The difficulty badge is the element whose exact text is the uppercased value.
  return screen.getByText(difficulty.toUpperCase());
}

describe("WordOfDayCard difficulty badge normalization", () => {
  beforeEach(() => invalidateCache());
  afterEach(() => vi.unstubAllGlobals());

  it("styles an uppercase DB difficulty (EASY) with the easy badge class", async () => {
    const badge = await renderBadge("EASY");
    expect(badge.className).toContain("text-emerald-600");
  });

  it("styles a lowercase difficulty (hard) with the hard badge class", async () => {
    const badge = await renderBadge("hard");
    expect(badge.className).toContain("text-red-600");
  });

  it("falls back to the medium badge for an unknown difficulty", async () => {
    const badge = await renderBadge("UNKNOWN");
    expect(badge.className).toContain("text-amber-600");
  });
});
