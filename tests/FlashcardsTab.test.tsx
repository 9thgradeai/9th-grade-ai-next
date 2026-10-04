import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FlashcardsTab from "@/components/dashboard/FlashcardsTab";
import { invalidateCache } from "@/lib/services/api";

const CARDS = {
  flashcards: [
    {
      id: 1,
      subjectName: "English",
      question: "What does Abandon mean?",
      answer: "পরিত্যাগ করা",
      hint: "Think leaving",
      difficulty: "easy",
      examRelevance: ["BCS", "Bank"],
    },
    {
      id: 2,
      subjectName: "English",
      question: "What does Benevolent mean?",
      answer: "দয়ালু",
      hint: "",
      difficulty: "medium",
      examRelevance: ["BCS"],
    },
  ],
};

const REVIEW_STATE = {
  state: {
    flashcardId: 1,
    nextReview: new Date(Date.now() + 86400000).toISOString(),
    interval: 1,
    easeFactor: 2.5,
    repetitions: 1,
    lapses: 0,
  },
};

function stubFetch() {
  const calls: string[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init?.method ?? "GET", (init?.body as string) ?? ""]);
      if (url.includes("/api/flashcards/review")) {
        return { ok: true, status: 200, json: async () => REVIEW_STATE } as Response;
      }
      return { ok: true, status: 200, json: async () => CARDS } as Response;
    }),
  );
  return calls;
}

describe("FlashcardsTab", () => {
  beforeEach(() => {
    invalidateCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads decks from the API and starts a deck session", async () => {
    stubFetch();
    render(<FlashcardsTab />);
    // Deck from the API appears once loading resolves.
    expect(await screen.findByText("English")).toBeInTheDocument();
    // New cards land in the Learn phase by default.
    expect(screen.getByText("শিখুন")).toBeInTheDocument();

    fireEvent.click(screen.getByText("English"));
    expect(await screen.findByText("What does Abandon mean?")).toBeInTheDocument();
  });

  it("renders the answer on a pre-rotated back face so it reads normally", async () => {
    stubFetch();
    const { container } = render(<FlashcardsTab />);
    fireEvent.click(await screen.findByText("English"));
    await screen.findByText("What does Abandon mean?");

    fireEvent.click(screen.getByText("Show Answer"));
    // Both faces exist; the back face is pre-rotated 180° so the flip
    // animation lands it readable instead of mirrored.
    expect(await screen.findByText("পরিত্যাগ করা")).toBeInTheDocument();
    const back = screen.getByText("পরিত্যাগ করা").closest("div[style]") as HTMLElement;
    expect(back?.style.transform).toContain("rotateY(180deg)");
    expect(container.querySelector('[aria-pressed="true"]')).not.toBeNull();
  });

  it("persists a rating and completes the session after the last card", async () => {
    const calls = stubFetch();
    render(<FlashcardsTab />);
    fireEvent.click(await screen.findByText("English"));
    await screen.findByText("What does Abandon mean?");

    // Flip then rate the first card.
    fireEvent.click(screen.getByText("Show Answer"));
    fireEvent.click(screen.getByText("Good"));

    await waitFor(() => {
      const posts = calls.filter(([url, method]) => url.includes("/review") && method === "POST");
      expect(posts).toHaveLength(1);
      expect(JSON.parse(posts[0][2])).toEqual({ flashcardId: 1, rating: 2 });
    });

    // Second card appears; rating it finishes the session.
    expect(await screen.findByText("What does Benevolent mean?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show Answer"));
    fireEvent.click(screen.getByText("Easy"));

    expect(await screen.findByText("$ session complete")).toBeInTheDocument();
    expect(screen.getByText("Reviewed: 2")).toBeInTheDocument();
  });

  it("re-queues an Again card once instead of looping forever", async () => {
    stubFetch();
    render(<FlashcardsTab />);
    fireEvent.click(await screen.findByText("English"));
    await screen.findByText("What does Abandon mean?");

    fireEvent.click(screen.getByText("Show Answer"));
    fireEvent.click(screen.getByText("Again"));

    // Again card goes to the back: second card shows next.
    expect(await screen.findByText("What does Benevolent mean?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show Answer"));
    fireEvent.click(screen.getByText("Good"));

    // The Again card returns one final time, then the session completes.
    expect(await screen.findByText("What does Abandon mean?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show Answer"));
    fireEvent.click(screen.getByText("Good"));

    expect(await screen.findByText("$ session complete")).toBeInTheDocument();
  });

  it("filters decks by exam", async () => {
    stubFetch();
    render(<FlashcardsTab />);
    expect(await screen.findByText("English")).toBeInTheDocument();

    // Both cards are BCS-relevant; only the Bank-tagged one survives.
    fireEvent.click(screen.getByText("Bank"));
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("0/1 আয়ত্ত • 0%")).toBeInTheDocument();
  });

  it("shows an error with retry when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response),
    );
    render(<FlashcardsTab />);
    // NOTE: the API client retries 5xx responses with backoff (~3.5s total),
    // so the error state lands later than the default findBy timeout.
    expect(await screen.findByText("আবার চেষ্টা করুন", {}, { timeout: 10000 })).toBeInTheDocument();
    // No fake studyable decks are offered on failure.
    expect(screen.queryByText("সব ডিউ কার্ড একসাথে রিভিউ করুন")).not.toBeInTheDocument();
  });
});
