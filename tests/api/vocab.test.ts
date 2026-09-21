// @vitest-environment node
//
// Vocab API integration tests — tests the HTTP seam for vocab endpoints
// against the mocked Prisma client.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { hash } from "bcryptjs";

import { GET as wordsGET } from "~app/api/vocab/words/route";
import { GET as statsGET } from "~app/api/vocab/stats/route";
import { GET as wotdGET } from "~app/api/vocab/word-of-the-day/route";
import { POST as reviewPOST } from "~app/api/vocab/review/route";
import { GET as dailyGET } from "~app/api/vocab/daily/route";
import { GET as quizGET } from "~app/api/vocab/quiz/route";
import { GET as decksGET } from "~app/api/vocab/decks/route";
import { POST as decksPOST } from "~app/api/vocab/decks/route";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

const TEST_PASSWORD = "correct-horse-battery";
let passwordHashBcrypt: string;

beforeAll(async () => {
  passwordHashBcrypt = await hash(TEST_PASSWORD, 10);
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "usr_123",
    name: "Test Aspirant",
    email: "aspirant@example.com",
    handle: "aspirant",
    passwordHash: passwordHashBcrypt,
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function sessionCookieFor(email: string): Promise<string> {
  const token = await signSession({ email, ver: 0 });
  return `auth_token=${token}`;
}

async function authedRequest(build: (cookie: string) => Request): Promise<Response> {
  const cookie = await sessionCookieFor("aspirant@example.com");
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
  return build(cookie);
}

function mockVocabWord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    word: "Abandon",
    bengaliMeaning: "পরিত্যাগ করা",
    partOfSpeech: "Verb",
    verbForms: ["abandon", "abandoned"],
    synonyms: ["desert", "forsake"],
    antonyms: ["retain", "keep"],
    exampleSentence: "The government decided to abandon the outdated policy.",
    exampleSentenceBn: "সরকার সেকেলে নীতিটি পরিত্যাগ করার সিদ্ধান্ত নেয়।",
    context: "Used for policies and plans.",
    mnemonic: "Ab + abandon = a band leaves the stage.",
    examRelevance: ["BCS", "Bank"],
    frequency: 95,
    difficulty: "EASY",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockVocabProgress(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: "usr_123",
    wordId: 1,
    status: "LEARNING",
    ease: 2.5,
    interval: 1,
    repetitions: 1,
    nextReview: new Date(),
    lastReviewedAt: new Date(),
    totalReviews: 3,
    correctCount: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── GET /api/vocab/words ──────────────────────────────────

describe("GET /api/vocab/words", () => {
  it("returns words list without auth", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([mockVocabWord()] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await wordsGET(getRequest("/api/vocab/words"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words).toBeInstanceOf(Array);
    expect(body.words.length).toBe(1);
    expect(body.words[0].word).toBe("Abandon");
  });

  it("returns words with auth and progress data", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([mockVocabWord()] as never);
    vi.mocked(prisma.vocabProgress.findMany)
      .mockResolvedValueOnce([mockVocabProgress()] as never) // for personalization sort
      .mockResolvedValueOnce([mockVocabProgress()] as never); // for progress map

    const res = await wordsGET(getRequest("/api/vocab/words", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words[0].progress).toBeDefined();
  });

  it("applies limit parameter", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await wordsGET(getRequest("/api/vocab/words?limit=5"));
    expect(res.status).toBe(200);
    expect(prisma.vocabWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it("applies difficulty filter", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await wordsGET(getRequest("/api/vocab/words?difficulty=EASY"));
    expect(prisma.vocabWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { difficulty: "EASY" } }),
    );
  });

  it("skips difficulty filter for ALL", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await wordsGET(getRequest("/api/vocab/words?difficulty=ALL"));
    expect(prisma.vocabWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

// ── GET /api/vocab/stats ──────────────────────────────────

describe("GET /api/vocab/stats", () => {
  it("requires a session (401)", async () => {
    const res = await statsGET(getRequest("/api/vocab/stats"));
    expect(res.status).toBe(401);
  });

  it("returns stats for authenticated user", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabWord.count).mockResolvedValue(120);
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([
      mockVocabProgress({ status: "MASTERED", nextReview: new Date("2099-01-01") }),
      mockVocabProgress({ id: 2, status: "LEARNING", nextReview: new Date("2099-01-01") }),
      mockVocabProgress({ id: 3, status: "REVIEW", nextReview: new Date("2020-01-01") }),
    ] as never);

    const res = await statsGET(getRequest("/api/vocab/stats", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(120);
    expect(body.mastered).toBe(1);
    expect(body.learning).toBe(1);
    expect(body.due).toBe(1);
    expect(body.reviewed).toBe(3);
  });
});

// ── GET /api/vocab/word-of-the-day ────────────────────────

describe("GET /api/vocab/word-of-the-day", () => {
  it("returns a word of the day without auth", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([
      mockVocabWord(),
      mockVocabWord({ id: 2, word: "Benevolent" }),
    ] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await wotdGET(getRequest("/api/vocab/word-of-the-day"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.word).toBeDefined();
    expect(body.word.word).toBeDefined();
  });

  it("returns weekly words with ?weekly=true", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => mockVocabWord({ id: i + 1, word: `Word${i}` })) as never,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await wotdGET(getRequest("/api/vocab/word-of-the-day?weekly=true"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words).toBeInstanceOf(Array);
  });
});

// ── POST /api/vocab/review ────────────────────────────────

describe("POST /api/vocab/review", () => {
  it("requires a session (401)", async () => {
    const res = await reviewPOST(jsonRequest("/api/vocab/review", { wordId: 1, rating: 3 }));
    expect(res.status).toBe(401);
  });

  it("rejects missing wordId with 400", async () => {
    const res = await reviewPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/review", { rating: 3 }, { cookie }),
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid rating with 400", async () => {
    const res = await reviewPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/review", { wordId: 1, rating: 5 }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });

  it("accepts legacy boolean correct field", async () => {
    vi.mocked(prisma.vocabWord.findUnique).mockResolvedValue(mockVocabWord() as never);
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.vocabProgress.create).mockResolvedValue(mockVocabProgress() as never);
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockVocabProgress() as never);

    const res = await reviewPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/review", { wordId: 1, correct: true }, { cookie }),
    ));
    expect(res.status).toBe(200);
  });

  it("records a review successfully with rating", async () => {
    vi.mocked(prisma.vocabWord.findUnique).mockResolvedValue(mockVocabWord() as never);
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(mockVocabProgress() as never);
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockVocabProgress() as never);

    const res = await reviewPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/review", { wordId: 1, rating: 3 }, { cookie }),
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeDefined();
    expect(body.word).toBeDefined();
  });

  it("rejects cross-origin POST with 403", async () => {
    const res = await reviewPOST(
      jsonRequest(
        "/api/vocab/review",
        { wordId: 1, rating: 3 },
        { origin: "https://evil.example.net" },
      ),
    );
    expect(res.status).toBe(403);
  });
});

// ── GET /api/vocab/daily ──────────────────────────────────

describe("GET /api/vocab/daily", () => {
  it("requires a session (401)", async () => {
    const res = await dailyGET(getRequest("/api/vocab/daily"));
    expect(res.status).toBe(401);
  });

  it("returns daily progress for authenticated user", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([
      mockVocabProgress({ totalReviews: 5, correctCount: 4 }),
    ] as never);
    vi.mocked(prisma.vocabProgress.count).mockResolvedValue(5);

    const res = await dailyGET(getRequest("/api/vocab/daily", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("wordsReviewed");
    expect(body).toHaveProperty("streak");
    expect(body.wordsReviewed).toBe(1);
  });
});

// ── GET /api/vocab/quiz ───────────────────────────────────

describe("GET /api/vocab/quiz", () => {
  it("requires a session (401)", async () => {
    const res = await quizGET(getRequest("/api/vocab/quiz"));
    expect(res.status).toBe(401);
  });

  it("returns quiz words for authenticated user", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => mockVocabWord({ id: i + 1, word: `Word${i}` })) as never,
    );
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);

    const res = await quizGET(getRequest("/api/vocab/quiz", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words).toBeInstanceOf(Array);
  });

  it("returns empty when fewer than 4 words exist", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([
      mockVocabWord({ id: 1 }),
      mockVocabWord({ id: 2 }),
    ] as never);

    const res = await quizGET(getRequest("/api/vocab/quiz", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words).toEqual([]);
  });

  it("applies count parameter", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => mockVocabWord({ id: i + 1, word: `Word${i}` })) as never,
    );
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);

    const res = await quizGET(getRequest("/api/vocab/quiz?count=5", { cookie }));
    expect(res.status).toBe(200);
  });
});

// ── GET /api/vocab/decks ──────────────────────────────────

describe("GET /api/vocab/decks", () => {
  it("returns decks without auth", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.vocabDeck.findMany).mockResolvedValue([] as never);

    const res = await decksGET(getRequest("/api/vocab/decks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decks).toBeInstanceOf(Array);
  });
});

// ── POST /api/vocab/decks ─────────────────────────────────

describe("POST /api/vocab/decks", () => {
  it("requires a session (401)", async () => {
    const res = await decksPOST(jsonRequest("/api/vocab/decks", { name: "My Deck" }));
    expect(res.status).toBe(401);
  });

  it("rejects empty deck name with 400", async () => {
    const res = await decksPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/decks", { name: "" }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });

  it("rejects cross-origin POST with 403", async () => {
    const res = await decksPOST(
      jsonRequest(
        "/api/vocab/decks",
        { name: "My Deck" },
        { origin: "https://evil.example.net" },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("creates a deck with valid payload", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.vocabDeck.create).mockResolvedValue({
      id: 1,
      userId: "usr_123",
      name: "BCS Vocab",
      nameBn: null,
      description: null,
      icon: null,
      color: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const res = await decksPOST(
      jsonRequest("/api/vocab/decks", { name: "BCS Vocab" }, { cookie }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.deck.name).toBe("BCS Vocab");
  });
});
