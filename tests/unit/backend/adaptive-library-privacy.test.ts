import { describe, expect, it } from "vitest";

import { createAdaptiveLibraryService } from "~backend/services/adaptive-exam/adaptive-library-service";
import type {
  MockPublication,
  MockPublicationStore,
  PaperSnapshot,
  PaperStore,
} from "~backend/services/adaptive-exam/contracts";

const NOW = "2026-11-28T00:00:00.000Z";

function publication(overrides: Partial<MockPublication> = {}): MockPublication {
  return {
    id: `pub-${overrides.paperId ?? "p1"}`,
    paperId: "p1",
    status: "PUBLISHED",
    titleBn: "মক টেস্ট",
    titleEn: "Mock test",
    visibility: "PUBLIC",
    contentHash: "paper-hash",
    immutable: true,
    createdBy: "admin-1",
    createdAt: NOW,
    ...overrides,
  };
}

function paper(id: string): PaperSnapshot {
  return {
    id,
    version: 1,
    blueprintId: "bp-1",
    blueprintHash: "bp-hash",
    createdAt: NOW,
    contentHash: "paper-hash",
    validation: "PASS",
    questions: [
      {
        position: 1,
        sourceType: "PYQ",
        subjectId: "bangla",
        subjectName: "Bangla",
        topicPath: "bangla/sahitya",
        language: "bn",
        difficulty: "MEDIUM",
        questionText: "কে লিখেছেন?",
        options: { A: "ক", B: "খ", C: "গ", D: "ঘ" },
        provenance: { sourceType: "PYQ" },
        marks: 1,
      },
    ],
  } as PaperSnapshot;
}

function stores(publications: MockPublication[], papers: PaperSnapshot[]) {
  const publicationRows = new Map(publications.map((row) => [row.paperId, row]));
  const paperRows = new Map(papers.map((row) => [row.id, row]));
  const publicationStore: MockPublicationStore = {
    async put(row) {
      publicationRows.set(row.paperId, row);
      return row;
    },
    async get(paperId) {
      return publicationRows.get(paperId) ?? null;
    },
    async getById(id) {
      return [...publicationRows.values()].find((row) => row.id === id) ?? null;
    },
    async list() {
      return [...publicationRows.values()];
    },
    async updateStatus(id, patch) {
      const row = [...publicationRows.values()].find((existing) => existing.id === id);
      if (!row) throw new Error("missing publication");
      const updated = { ...row, ...patch };
      publicationRows.set(row.paperId, updated);
      return updated;
    },
  };
  const paperStore: PaperStore = {
    async put(row) {
      paperRows.set(row.id, row);
      return row;
    },
    async get(id) {
      return paperRows.get(id) ?? null;
    },
  };
  return { publicationStore, paperStore };
}

function service(publications: MockPublication[], papers: PaperSnapshot[]) {
  const { publicationStore, paperStore } = stores(publications, papers);
  return createAdaptiveLibraryService({
    publications: publicationStore,
    papers: paperStore,
    clock: { now: () => NOW },
  });
}

describe("shared adaptive mock library privacy", () => {
  it("never lists draft/private/closed-window papers and never exposes answer keys", async () => {
    const library = service(
      [
        publication({ paperId: "draft", status: "DRAFT" }),
        publication({ paperId: "private", visibility: "PRIVATE" }),
        publication({
          paperId: "closed",
          availableFrom: "2026-12-01T00:00:00.000Z",
        }),
        publication({ paperId: "open" }),
      ],
      [paper("draft"), paper("private"), paper("closed"), paper("open")],
    );

    const entries = await library.list();
    expect(entries.map((entry) => entry.paperId)).toEqual(["open"]);
    expect(entries[0].paper).toBeDefined();
    expect(JSON.stringify(entries[0])).not.toContain("correctOption");
    expect(JSON.stringify(entries[0])).not.toContain("answerKey");
  });

  it("exposes upcoming mocks as metadata only, even on a direct read", async () => {
    const library = service(
      [publication({ paperId: "upcoming", status: "UPCOMING", availableFrom: "2026-12-01T00:00:00.000Z" })],
      [paper("upcoming")],
    );
    const listed = await library.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].paper).toBeUndefined();
    expect(listed[0].availableFrom).toBe("2026-12-01T00:00:00.000Z");

    const direct = await library.get("upcoming", "candidate-1");
    expect(direct?.paper).toBeUndefined();
    expect(JSON.stringify(direct)).not.toContain("questionText");
  });

  it("respects private ownership on direct reads", async () => {
    const library = service(
      [publication({ paperId: "mine", visibility: "PRIVATE", createdBy: "candidate-1" })],
      [paper("mine")],
    );
    expect(await library.get("mine", "candidate-2")).toBeNull();
    expect((await library.get("mine", "candidate-1"))?.paper).toBeDefined();
  });

  it("publishes with immutable metadata and only allows lifecycle status changes", async () => {
    const library = service([], [paper("new-paper")]);
    const created = await library.publish({
      paperId: "new-paper",
      status: "UPCOMING",
      titleBn: "আসন্ন মক",
      titleEn: "Upcoming mock",
      availableFrom: "2026-12-01T00:00:00.000Z",
      actorId: "admin-1",
    });
    expect(created.visibility).toBe("PUBLIC");
    expect(created.immutable).toBe(true);
    expect(created.contentHash).toBe("paper-hash");

    const updated = await library.publish({
      paperId: "new-paper",
      status: "PUBLISHED",
      titleBn: "আসন্ন মক",
      titleEn: "Upcoming mock",
      actorId: "admin-1",
    });
    expect(updated.status).toBe("PUBLISHED");
    expect(updated.contentHash).toBe(created.contentHash);
    expect(updated.titleEn).toBe(created.titleEn);
  });

  it("fails loud when publishing a missing paper", async () => {
    const library = service([], []);
    await expect(
      library.publish({
        paperId: "missing",
        status: "PUBLISHED",
        titleBn: "মক",
        titleEn: "Mock",
        actorId: "admin-1",
      }),
    ).rejects.toThrow(/missing paper/i);
  });
});
