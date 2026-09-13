import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      // Longest-prefix match first so "/api/exam-papers/1" beats "/api/exam-papers".
      const match = Object.keys(routes)
        .sort((a, b) => b.length - a.length)
        .find((r) => url.startsWith(r));
      if (!match) {
        return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => routes[match] } as Response;
    }),
  );
}

const historyPayload = {
  history: {
    past: [
      {
        id: 7,
        attemptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        title: "কাস্টম পরীক্ষা",
        type: "custom",
        score: 80,
        correct: 8,
        total: 10,
        durationSec: 600,
        percentage: 80,
        createdAt: "2026-09-01T10:10:00.000Z",
      },
      {
        id: 3,
        attemptId: "mock-3",
        title: "বিসিএস মক টেস্ট ১",
        type: "mock",
        score: 55,
        correct: 11,
        total: 20,
        durationSec: 1200,
        percentage: 55,
        createdAt: "2026-08-20T10:10:00.000Z",
      },
    ],
    upcoming: [
      {
        id: 3,
        titleBn: "৪৭তম বিসিএস লিখিত",
        titleEn: "47th BCS Written",
        type: "BCS",
        date: "2026-12-01T09:00:00.000Z",
        year: "2026",
        circularNo: "47",
        note: "",
        verified: true,
        daysUntil: 42,
      },
    ],
  },
};

const papersPayload = {
  papers: [
    {
      id: 1,
      titleBn: "৪৬তম বিসিএস প্রিলিমিনারি",
      titleEn: "46th BCS Preliminary",
      examId: 2,
      examNameBn: "বিসিএস প্রিলিমিনারি",
      examNameEn: "BCS Preliminary",
      examType: "PRELIMINARY",
      year: 2024,
      heldOn: null,
      durationMin: 120,
      totalQuestions: 200,
      availableQuestions: 2,
      provenance: "CURATED",
      subjectId: 3,
      subjectNameBn: "বাংলা",
    },
  ],
};

const paperQuestionsPayload = {
  questions: [
    {
      id: 1,
      subjectId: 3,
      subject: "বাংলা ভাষা ও সাহিত্য",
      topic: "ভাষা",
      subtopic: "বানান",
      question: "শুদ্ধ বানান কোনটি?",
      options: ["বাংলাদেশ", "বাঙলাদেশ", "বাংলাদশ", "বাঙলাদশ"],
      correctAnswer: "বাংলাদেশ",
      explanation: "সঠিক বানান বাংলাদেশ।",
      difficulty: "EASY",
      year: 2024,
      sourceExam: "46th BCS",
      questionNumber: 1,
    },
    {
      id: 2,
      subjectId: 3,
      subject: "বাংলা ভাষা ও সাহিত্য",
      topic: "সাহিত্য",
      subtopic: "কবি",
      question: "গীতাঞ্জলির রচয়িতা কে?",
      options: ["কাজী নজরুল", "রবীন্দ্রনাথ ঠাকুর", "জসীমউদ্দীন", "সুকান্ত"],
      correctAnswer: "রবীন্দ্রনাথ ঠাকুর",
      explanation: "১৯১৩ সালে নোবেল পুরস্কার।",
      difficulty: "EASY",
      year: 2024,
      sourceExam: "46th BCS",
      questionNumber: 2,
    },
  ],
};

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("ExamHistoryTab", () => {
  it("renders past results and upcoming exams", async () => {
    stubFetch({ "/api/exam-history": historyPayload });
    const { default: ExamHistoryTab } = await import("@/components/dashboard/ExamHistoryTab");
    render(<ExamHistoryTab />);

    expect(await screen.findByText("পরীক্ষা ইতিহাস ও আপকামিং")).toBeInTheDocument();
    expect(await screen.findByText("কাস্টম পরীক্ষা")).toBeInTheDocument();
    expect(await screen.findByText("বিসিএস মক টেস্ট ১")).toBeInTheDocument();
    expect(await screen.findByText("৪৭তম বিসিএস লিখিত")).toBeInTheDocument();
  });

  it("filters past results by exam type", async () => {
    stubFetch({ "/api/exam-history": historyPayload });
    const { default: ExamHistoryTab } = await import("@/components/dashboard/ExamHistoryTab");
    render(<ExamHistoryTab />);

    await screen.findByText("কাস্টম পরীক্ষা");
    // First match is the filter button; the second is the item's type badge.
    fireEvent.click(screen.getAllByText("মক টেস্ট")[0]);

    await waitFor(() => {
      expect(screen.queryByText("কাস্টম পরীক্ষা")).not.toBeInTheDocument();
    });
    expect(screen.getByText("বিসিএস মক টেস্ট ১")).toBeInTheDocument();
  });

  it("shows an empty state when there is no history", async () => {
    stubFetch({ "/api/exam-history": { history: { past: [], upcoming: [] } } });
    const { default: ExamHistoryTab } = await import("@/components/dashboard/ExamHistoryTab");
    render(<ExamHistoryTab />);

    expect(await screen.findByText("কোনো পরীক্ষার ইতিহাস নেই")).toBeInTheDocument();
  });
});

describe("RealExamTab", () => {
  it("lists available papers", async () => {
    stubFetch({ "/api/exam-papers": papersPayload });
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<RealExamTab />);

    expect(await screen.findByText("রিয়েল এক্সাম (অফলাইন)")).toBeInTheDocument();
    expect(await screen.findByText("৪৬তম বিসিএস প্রিলিমিনারি")).toBeInTheDocument();
  });

  it("opens a paper and shows PDF export options", async () => {
    stubFetch({ "/api/exam-papers": papersPayload, "/api/exam-papers/1": paperQuestionsPayload });
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<RealExamTab />);

    fireEvent.click(await screen.findByText("খুলুন ও PDF নিন"));

    expect(await screen.findByText("PDF এক্সপোর্ট অপশন")).toBeInTheDocument();
    expect(screen.getByText("উত্তরসহ")).toBeInTheDocument();
    expect(screen.getByText("ব্যাখ্যাসহ")).toBeInTheDocument();
    expect(screen.getByText("শুদ্ধ বানান কোনটি?")).toBeInTheDocument();
  });

  it("runs an offline self-graded exam", async () => {
    stubFetch({ "/api/exam-papers": papersPayload, "/api/exam-papers/1": paperQuestionsPayload });
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<RealExamTab />);

    fireEvent.click(await screen.findByText("খুলুন ও PDF নিন"));
    fireEvent.click(await screen.findByText("অফলাইনে পরীক্ষা দিন"));

    expect(await screen.findByText("উত্তর মিলিয়ে দেখুন")).toBeInTheDocument();

    // Answer the first question correctly.
    fireEvent.click(screen.getByText("বাংলাদেশ"));
    fireEvent.click(screen.getByText("উত্তর মিলিয়ে দেখুন"));

    expect(await screen.findByText(/স্কোর: 1\/2/)).toBeInTheDocument();
  });
});
