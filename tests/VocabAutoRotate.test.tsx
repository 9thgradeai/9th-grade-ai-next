import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import VocabTab, { WORD_ROTATE_MS, formatRotationCountdown } from "@/components/dashboard/VocabTab";
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
    progress: null,
  };
}

const WORDS = [word(1, "Abate"), word(2, "Benevolent")];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/vocab/words")) return { ok: true, status: 200, json: async () => ({ words: WORDS }) } as Response;
      if (url.startsWith("/api/vocab/stats")) {
        return { ok: true, status: 200, json: async () => ({ total: 2, mastered: 0, learning: 0, due: 0, reviewed: 0 }) } as Response;
      }
      if (url.startsWith("/api/vocab/daily")) {
        return { ok: true, status: 200, json: async () => ({ wordsReviewed: 0, totalReviewsToday: 0, correctToday: 0, streak: 0 }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

async function renderReady() {
  render(
    <LanguageProvider>
      <VocabTab />
    </LanguageProvider>,
  );
  // Flush config/word loads. NOTE: no findBy* under fake timers — waitFor's
  // polling never fires on a fake clock. Drive with async advancement and
  // assert synchronously instead (proven pattern from QuickPracticeFlow).
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
}

describe("formatRotationCountdown", () => {
  it("formats mm:ss and clamps negatives", () => {
    expect(formatRotationCountdown(WORD_ROTATE_MS)).toBe("10:00");
    expect(formatRotationCountdown(61_000)).toBe("01:01");
    expect(formatRotationCountdown(900)).toBe("00:01");
    expect(formatRotationCountdown(-5_000)).toBe("00:00");
  });

  it("is a 10-minute period", () => {
    expect(WORD_ROTATE_MS).toBe(10 * 60 * 1000);
  });
});

describe("VocabTab auto-rotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateCache();
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("advances to the next word after 10 minutes without any tap", async () => {
    await renderReady();
    // Countdown is already ticking (load flush consumed ~1s) — assert live
    // mm:ss format rather than an exact value.
    expect(screen.getByRole("timer", { name: /পরের শব্দ|Next word in/ }).textContent).toMatch(/^\d\d:\d\d$/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 1500);
    });

    expect(screen.getByRole("heading", { name: "Benevolent" })).toBeInTheDocument();
    // Polite live region announces the automatic advance.
    expect(screen.getByRole("status")).toHaveTextContent(/Benevolent/);
  });

  it("wraps around at the end of the list", async () => {
    await renderReady();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 1500);
    });
    expect(screen.getByRole("heading", { name: "Benevolent" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 1500);
    });
    expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
  });

  it("pause stops rotation and resume restarts the full period", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: /বিরতি দিন|Pause auto-rotation/ }));
    expect(screen.getByRole("button", { name: /চালু করুন|Resume auto-rotation/ })).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS + 5000);
    });
    expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /চালু করুন|Resume auto-rotation/ }));
    // Resuming restarts the clock: 9:59 of silence first…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS - 1000);
    });
    expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
    // …then the advance fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole("heading", { name: "Benevolent" })).toBeInTheDocument();
  });

  it("manual navigation restarts the 10-minute clock", async () => {
    await renderReady();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS - 2000);
    });
    // Manual jump with 2s left on the clock…
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    expect(screen.getByRole("heading", { name: "Benevolent" })).toBeInTheDocument();
    // …restarts the full period instead of advancing 2s later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("heading", { name: "Benevolent" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORD_ROTATE_MS);
    });
    expect(screen.getByRole("heading", { name: "Abate" })).toBeInTheDocument();
  });
});
