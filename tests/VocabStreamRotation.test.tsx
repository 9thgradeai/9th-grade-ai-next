import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import VocabStreamView from "@/components/dashboard/vocab/VocabStreamView";
import { LanguageProvider } from "@/lib/lang-ctx";
import { WORD_ROTATE_MS } from "@/components/dashboard/VocabTab";

function streamWord(id: number, w: string) {
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
    status: "NEW",
    source: "FRESH",
  };
}

const WORDS = [streamWord(1, "Abate"), streamWord(2, "Benevolent"), streamWord(3, "Candid")];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
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
            rotatesAt: new Date(Date.now() + WORD_ROTATE_MS).toISOString(),
            wordOfDay: null,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

async function renderReady() {
  render(
    <LanguageProvider>
      <VocabStreamView />
    </LanguageProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
}

describe("VocabStreamView rotation controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("exposes a pause button and a live countdown", async () => {
    await renderReady();
    const pause = screen.getByRole("button", { name: "Pause auto-rotation" });
    expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("timer")).toHaveTextContent("02:00");
  });

  it("does not advance while paused", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Pause auto-rotation" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 5000);
    });
    expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Paused");
  });

  it("advances exactly once per period after resuming (no duplicate timer)", async () => {
    await renderReady();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 1000);
    });
    // The old duplicate timeout would have advanced twice here.
    expect(screen.getByRole("heading", { name: "Benevolent" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause auto-rotation" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume auto-rotation" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 1000);
    });
    expect(screen.getByRole("heading", { name: "Candid" })).toBeInTheDocument();
  });

  it("pauses the countdown while the answer is revealed", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: /Reveal & Memorize/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 5000);
    });
    expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
  });
});
