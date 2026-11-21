import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuizMode from "@/components/dashboard/vocab/QuizMode";
import { LanguageProvider } from "@/lib/lang-ctx";
import { invalidateCache } from "@/lib/services/api";

const WORDS = [
  {
    id: 101,
    word: "Abandon",
    bengaliMeaning: "পরিত্যাগ",
    partOfSpeech: "Verb",
    exampleSentence: "They abandon the plan.",
    mode: "recognize",
    distractors: [
      { id: 201, word: "Keep", bengaliMeaning: "রাখা" },
      { id: 202, word: "Hold", bengaliMeaning: "ধরা" },
      { id: 203, word: "Retain", bengaliMeaning: "ধরে রাখা" },
    ],
  },
  ...[102, 103, 104].map((id) => ({
    id,
    word: `Word${id}`,
    bengaliMeaning: `অর্থ${id}`,
    partOfSpeech: "Noun",
    exampleSentence: `Example ${id}.`,
    mode: "recognize",
    distractors: [
      { id: id * 10 + 1, word: "A", bengaliMeaning: "এ" },
      { id: id * 10 + 2, word: "B", bengaliMeaning: "বি" },
      { id: id * 10 + 3, word: "C", bengaliMeaning: "সি" },
    ],
  })),
];

function stubQuiz() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/vocab/quiz")) {
        return { ok: true, status: 200, json: async () => ({ words: WORDS }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

async function renderQuiz() {
  const utils = render(
    <LanguageProvider>
      <QuizMode onExit={() => {}} />
    </LanguageProvider>,
  );
  await waitFor(() => expect(utils.container.querySelector(".grid button")).toBeTruthy());
  return utils.container.querySelectorAll<HTMLButtonElement>(".grid button");
}

describe("QuizMode option/keyboard mapping", () => {
  beforeEach(() => {
    invalidateCache();
    stubQuiz();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("the number key selects the option actually displayed at that position", async () => {
    const optionButtons = await renderQuiz();
    expect(optionButtons).toHaveLength(4);

    // Read the label rendered in position 1 (the second span of the button).
    const firstLabel = optionButtons[0].querySelectorAll("span")[1]?.textContent?.trim();
    const firstIsCorrect = firstLabel === WORDS[0].bengaliMeaning;

    fireEvent.keyDown(window, { key: "1" });

    await waitFor(() => expect(screen.getByText(/^\d+ ✓$/)).toBeTruthy());
    // Score must reflect the correctness of the DISPLAYED first option. If the
    // handler re-shuffled on keypress this would disagree with the rendered grid.
    expect(screen.getByText(/^\d+ ✓$/).textContent).toBe(firstIsCorrect ? "1 ✓" : "0 ✓");
    // Answering reveals the explanation line.
    expect(screen.getByText(/Why/)).toBeTruthy();
  });

  it("clicking a rendered option grades against that same option", async () => {
    const optionButtons = await renderQuiz();
    // Click the option whose label equals the target meaning — that is the
    // correct answer regardless of shuffle order.
    const correctButton = Array.from(optionButtons).find(
      (b) => b.querySelectorAll("span")[1]?.textContent?.trim() === WORDS[0].bengaliMeaning,
    );
    expect(correctButton).toBeTruthy();

    fireEvent.click(correctButton!);

    await waitFor(() => expect(screen.getByText(/^\d+ ✓$/).textContent).toBe("1 ✓"));
  });
});
