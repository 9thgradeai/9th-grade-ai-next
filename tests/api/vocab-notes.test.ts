// @vitest-environment node
//
// Integration tests for the integrated Vocab note API — verifies the HTTP
// seam, per-user scoping, and validation against the mocked Prisma client.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { User as PrismaUser, VocabWord as PrismaVocabWord } from "@prisma/client";
import { hash } from "bcryptjs";

import { GET as notesGET, POST as notesPOST, DELETE as notesDELETE } from "~app/api/vocab/notes/route";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function deleteRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const TEST_PASSWORD = "correct-horse-battery";
let passwordHashBcrypt: string;

beforeAll(async () => {
  passwordHashBcrypt = await hash(TEST_PASSWORD, 10);
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockUser(id = "usr_123"): PrismaUser {
  return {
    id,
    name: "Test Aspirant",
    email: "aspirant@example.com",
    handle: "aspirant",
    passwordHash: passwordHashBcrypt,
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as unknown as PrismaUser;
}

async function authedRequest<T extends Request>(build: (cookie: string) => T): Promise<T> {
  const token = await signSession({ email: "aspirant@example.com", ver: 0 });
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
  return build(`auth_token=${token}`);
}

function mockVocabWord(overrides: Record<string, unknown> = {}): PrismaVocabWord {
  return {
    id: 1,
    word: "Abandon",
    bengaliMeaning: "পরিত্যাগ করা",
    partOfSpeech: "Verb",
    verbForms: ["abandon", "abandoned"],
    synonyms: ["desert", "forsake"],
    antonyms: ["retain", "keep"],
    exampleSentence: "The government decided to abandon the outdated policy.",
    exampleSentenceBn: null,
    context: "Used for policies and plans.",
    mnemonic: "Ab + abandon = a band leaves the stage.",
    examRelevance: ["BCS", "Bank"],
    frequency: 95,
    difficulty: "EASY",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as PrismaVocabWord;
}

// ── GET /api/vocab/notes ──────────────────────────────────

describe("GET /api/vocab/notes", () => {
  it("requires a session (401)", async () => {
    const res = await notesGET(new Request(`${BASE}/api/vocab/notes`));
    expect(res.status).toBe(401);
  });

  it("returns the caller's notes with full word DTOs, scoped by userId", async () => {
    const req = await authedRequest((cookie) =>
      new Request(`${BASE}/api/vocab/notes`, { headers: { cookie } }),
    );
    vi.mocked(prisma.vocabNote.findMany).mockResolvedValue([
      { id: 5, userId: "usr_123", wordId: 1, note: "Remember this", createdAt: new Date(), updatedAt: new Date(), word: mockVocabWord() },
    ] as never);
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);

    const res = await notesGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0]).toMatchObject({ wordId: 1, note: "Remember this" });
    expect(body.notes[0].word.word).toBe("Abandon");
    // Per-user scoping: only the authenticated user's rows are queried.
    expect(prisma.vocabNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "usr_123" } }),
    );
  });
});

// ── POST /api/vocab/notes ─────────────────────────────────

describe("POST /api/vocab/notes", () => {
  it("requires a session (401)", async () => {
    const res = await notesPOST(jsonRequest("/api/vocab/notes", { wordId: 1, note: "x" }));
    expect(res.status).toBe(401);
  });

  it("rejects cross-origin POST with 403", async () => {
    const res = await notesPOST(
      jsonRequest("/api/vocab/notes", { wordId: 1, note: "x" }, { origin: "https://evil.example.net" }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a missing/invalid wordId with 400", async () => {
    const res = await notesPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/notes", { note: "x" }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the word does not exist", async () => {
    vi.mocked(prisma.vocabWord.findUnique).mockResolvedValue(null);
    const res = await notesPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/notes", { wordId: 999, note: "x" }, { cookie }),
    ));
    expect(res.status).toBe(404);
  });

  it("upserts one note per (user, word), trimming and capping the text", async () => {
    vi.mocked(prisma.vocabWord.findUnique).mockResolvedValue(mockVocabWord() as never);
    vi.mocked(prisma.vocabNote.upsert).mockResolvedValue({
      id: 5, userId: "usr_123", wordId: 1, note: "my note", createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const longNote = `  my note  ${"x".repeat(3000)}`;
    const res = await notesPOST(await authedRequest((cookie) =>
      jsonRequest("/api/vocab/notes", { wordId: 1, note: longNote }, { cookie }),
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.wordId).toBe(1);
    expect(body.note.word.word).toBe("Abandon");

    const upsertArg = vi.mocked(prisma.vocabNote.upsert).mock.calls[0][0];
    expect(upsertArg.where).toEqual({ userId_wordId: { userId: "usr_123", wordId: 1 } });
    const savedText = (upsertArg.create as { note: string }).note;
    expect(savedText.startsWith("my note")).toBe(true);
    expect(savedText.length).toBeLessThanOrEqual(2000);
  });
});

// ── DELETE /api/vocab/notes ───────────────────────────────

describe("DELETE /api/vocab/notes", () => {
  it("requires a session (401)", async () => {
    const res = await notesDELETE(deleteRequest("/api/vocab/notes", { wordId: 1 }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid wordId with 400", async () => {
    const res = await notesDELETE(await authedRequest((cookie) =>
      deleteRequest("/api/vocab/notes", {}, { cookie }),
    ));
    expect(res.status).toBe(400);
  });

  it("deletes only the caller's row for the given word", async () => {
    vi.mocked(prisma.vocabNote.deleteMany).mockResolvedValue({ count: 1 });
    const res = await notesDELETE(await authedRequest((cookie) =>
      deleteRequest("/api/vocab/notes", { wordId: 1 }, { cookie }),
    ));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.vocabNote.deleteMany).toHaveBeenCalledWith(
      { where: { userId: "usr_123", wordId: 1 } },
    );
  });
});
