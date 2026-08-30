import { describe, it, expect, vi } from "vitest";
import { prisma } from "~backend/db";
import { getQuestionBankExams } from "~backend/services/content";

describe("getQuestionBankExams (exam library)", () => {
  it("returns the hierarchy: category → exam → papers with real metadata", async () => {
    vi.mocked(prisma.examCategory.findMany).mockResolvedValue([
      {
        id: 1,
        slug: "bcs",
        nameBn: "BCS",
        nameEn: "BCS",
        icon: "📘",
        color: "text-sky-400",
        bg: "bg-sky-500/10",
        sortOrder: 1,
        exams: [
          {
            id: 1,
            slug: "bcs-preliminary",
            nameBn: "BCS প্রিলিমিনারি",
            nameEn: "BCS Preliminary",
            type: "PRELIMINARY",
            durationMin: 200,
            totalQuestions: 200,
            year: null,
            heldOn: null,
            verified: false,
            sortOrder: 1,
            papers: [
              {
                id: 50,
                slug: "bcs-preliminary-50th",
                titleBn: "৫০তম বিসিএস প্রিলিমিনারি",
                titleEn: "50th BCS Preliminary",
                bcsTerm: 50,
                termLabel: "50th",
                year: 2024,
                heldOn: null,
                durationMin: null,
                totalQuestions: null,
                availableQuestions: 7,
                provenance: "CURATED",
                verified: false,
              },
            ],
          },
        ],
      },
    ] as never);

    const result = await getQuestionBankExams();
    expect(result).toHaveLength(1);
    const cat = result[0];
    expect(cat.nameBn).toBe("BCS");
    expect(cat.exams).toHaveLength(1);
    const exam = cat.exams[0];
    expect(exam.nameBn).toBe("BCS প্রিলিমিনারি");
    expect(exam.type).toBe("PRELIMINARY");
    expect(exam.papers).toHaveLength(1);
    const paper = exam.papers[0];
    expect(paper.bcsTerm).toBe(50);
    expect(paper.termLabel).toBe("50th");
    expect(paper.availableQuestions).toBe(7);
    expect(paper.provenance).toBe("CURATED");
  });

  it("surfaces paper count and empty papers array for a new paperless exam", async () => {
    vi.mocked(prisma.examCategory.findMany).mockResolvedValue([
      {
        id: 1,
        slug: "bcs",
        nameBn: "BCS",
        nameEn: "BCS",
        icon: "📘",
        color: "text-sky-400",
        bg: "bg-sky-500/10",
        sortOrder: 1,
        exams: [
          {
            id: 2,
            slug: "bcs-written",
            nameBn: "BCS লিখিত",
            nameEn: "BCS Written",
            type: "WRITTEN",
            durationMin: null,
            totalQuestions: null,
            year: null,
            heldOn: null,
            verified: false,
            sortOrder: 2,
            papers: [],
          },
        ],
      },
    ] as never);

    const result = await getQuestionBankExams();
    expect(result[0].exams[0].papers).toEqual([]);
    expect(result[0].exams[0].type).toBe("WRITTEN");
  });
});
