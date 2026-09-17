import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ExamLibraryView from "@/components/dashboard/ExamLibraryView";

vi.mock("@/lib/services/api", () => ({
  api: {
    examLibrary: vi.fn(),
    questions: vi.fn(),
    submitPractice: vi.fn(),
  },
}));

import { api } from "@/lib/services/api";

const CATEGORIES = [
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
        type: "PRELIMINARY" as const,
        durationMin: null,
        totalQuestions: null,
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
            availableQuestions: 2,
            provenance: "CURATED" as const,
            verified: false,
          },
        ],
      },
    ],
  },
];

const QUESTIONS = [
  {
    id: 1,
    subjectId: 1,
    subject: "বাংলা ভাষা ও সাহিত্য",
    topic: "",
    subtopic: "",
    question: "প্রশ্ন এক?",
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "ক",
    explanation: "",
    difficulty: "MEDIUM" as const,
    year: 2024,
    sourceExam: "৫০তম বিসিএস",
    bcsTerm: "50th",
    paperId: 50,
    examId: 1,
    questionNumber: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.examLibrary).mockResolvedValue(CATEGORIES as never);
});

describe("ExamLibraryView", () => {
  it("renders the exam category hierarchy and a paper after choosing an exam", async () => {
    render(<ExamLibraryView />);
    // Category card is present (breadcrumb also shows BCS — use the exam chip
    // which is unique to the hierarchy body).
    const examChip = await screen.findByText("BCS প্রিলিমিনারি (1)");
    expect(examChip).toBeInTheDocument();
    // Papers appear only after selecting an exam.
    expect(screen.queryByText("৫০তম বিসিএস প্রিলিমিনারি")).not.toBeInTheDocument();
    examChip.click();
    expect(await screen.findByText("৫০তম বিসিএস প্রিলিমিনারি")).toBeInTheDocument();
  });

  it("loads and shows paper questions", async () => {
    vi.mocked(api.questions).mockResolvedValue(QUESTIONS as never);
    render(<ExamLibraryView />);

    // Select the exam chip to reveal papers, then select the paper.
    const examChip = await screen.findByText("BCS প্রিলিমিনারি (1)");
    examChip.click();
    const paperBtn = await screen.findByText("৫০তম বিসিএস প্রিলিমিনারি");
    paperBtn.click();

    await waitFor(() => {
      expect(screen.getByText("প্রশ্ন এক?")).toBeInTheDocument();
    });
    expect(api.questions).toHaveBeenCalledWith({ paperId: 50, limit: 200 });
  });

  it("shows an empty state when no exam library exists", async () => {
    vi.mocked(api.examLibrary).mockResolvedValue([] as never);
    render(<ExamLibraryView />);
    expect(await screen.findByText(/কোনো পরীক্ষার লাইব্রেরি নেই/)).toBeInTheDocument();
  });
});
