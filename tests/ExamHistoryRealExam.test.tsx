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
      return {
        ok: true,
        status: 200,
        json: async () => routes[match],
        // PDF exports read the body as a Blob (via api.exportRealExam's downloadFile).
        blob: async () => new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }),
      } as Response;
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
    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<EcosystemProvider><RealExamTab /></EcosystemProvider>);

    expect(await screen.findByText("রিয়েল এক্সাম (অফলাইন)")).toBeInTheDocument();
    expect(await screen.findByText("৪৬তম বিসিএস প্রিলিমিনারি")).toBeInTheDocument();
  });

  it("opens a paper and shows PDF export options", async () => {
    stubFetch({ "/api/exam-papers": papersPayload, "/api/exam-papers/1": paperQuestionsPayload });
    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<EcosystemProvider><RealExamTab /></EcosystemProvider>);

    fireEvent.click(await screen.findByText("খুলুন ও PDF নিন"));

    expect(await screen.findByText("PDF এক্সপোর্ট অপশন")).toBeInTheDocument();
    expect(screen.getByText("উত্তরসহ")).toBeInTheDocument();
    expect(screen.getByText("ব্যাখ্যাসহ")).toBeInTheDocument();
    expect(screen.getByText("শুদ্ধ বানান কোনটি?")).toBeInTheDocument();
  });

  it("runs an offline self-graded exam", async () => {
    stubFetch({ "/api/exam-papers": papersPayload, "/api/exam-papers/1": paperQuestionsPayload });
    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<EcosystemProvider><RealExamTab /></EcosystemProvider>);

    fireEvent.click(await screen.findByText("খুলুন ও PDF নিন"));
    fireEvent.click(await screen.findByText("অফলাইনে পরীক্ষা দিন"));

    expect(await screen.findByText("উত্তর মিলিয়ে দেখুন")).toBeInTheDocument();

    // Answer the first question correctly.
    fireEvent.click(screen.getByText("বাংলাদেশ"));
    fireEvent.click(screen.getByText("উত্তর মিলিয়ে দেখুন"));

    expect(await screen.findByText(/স্কোর: 1\/2/)).toBeInTheDocument();
  });

  it("exports an official paper via the slim paperId protocol", async () => {
    stubFetch({ "/api/exam-papers": papersPayload, "/api/exam-papers/1": paperQuestionsPayload });
    const seen: Array<{ url: string; body: string }> = [];
    const origFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/real-exam/export")) {
          seen.push({ url, body: String(init?.body ?? "") });
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }),
          } as Response;
        }
        return origFetch(input, init);
      }),
    );
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:test"),
        revokeObjectURL: vi.fn(),
      }),
    );

    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<EcosystemProvider><RealExamTab /></EcosystemProvider>);

    fireEvent.click(await screen.findByText("খুলুন ও PDF নিন"));
    expect(await screen.findByText("PDF এক্সপোর্ট অপশন")).toBeInTheDocument();

    fireEvent.click(screen.getByText("উত্তর ছাড়া PDF ডাউনলোড"));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    const payload = JSON.parse(seen[0].body) as { paperId?: number; questions?: unknown[] };
    // Slim protocol: only the paper id travels — no multi-KB question JSON.
    expect(payload.paperId).toBe(1);
    expect(payload.questions).toBeUndefined();
    expect(screen.queryByText("PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।")).not.toBeInTheDocument();
  });
});

describe("RealExamTab custom paper builder", () => {
  const examConfigPayload = {
    subjects: [
      {
        id: 3,
        nameBn: "বাংলা ভাষা ও সাহিত্য",
        nameEn: "Bengali",
        icon: "বাং",
        color: "#107c41",
        bg: "bg-emerald-500/10",
        questionCount: 2,
        nodes: [
          {
            id: 31,
            name: "ভাষা",
            path: "ভাষা",
            depth: 1,
            questionCount: 1,
            children: [
              {
                id: 311,
                name: "বানান",
                path: "ভাষা/বানান",
                depth: 2,
                questionCount: 1,
                children: [],
              },
            ],
          },
          {
            id: 32,
            name: "সাহিত্য",
            path: "সাহিত্য",
            depth: 1,
            questionCount: 1,
            children: [],
          },
        ],
      },
    ],
  };

  const builderQuestionsPayload = {
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
        bcsTerm: null,
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
        bcsTerm: null,
        questionNumber: 2,
      },
    ],
  };

  it("builds a paper from the subject/topic/subtopic picker and exports a PDF", async () => {
    stubFetch({
      "/api/exam-papers": papersPayload,
      "/api/exam/config": examConfigPayload,
      "/api/questions": builderQuestionsPayload,
      "/api/real-exam/export": { ok: true },
    });
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:test"),
        revokeObjectURL: vi.fn(),
      }),
    );

    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<EcosystemProvider><RealExamTab /></EcosystemProvider>);

    // Enter the custom paper builder from the Real Exam landing page.
    fireEvent.click(await screen.findByText("নতুন প্রশ্নপত্র তৈরি করুন"));

    // The selection tree loads — every subject is shown as in the Practice tab.
    expect(await screen.findByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();

    // Open the subject popup, keep the whole subject, and close it.
    const subjectCard = screen.getByText("বাংলা ভাষা ও সাহিত্য").closest("button") as HTMLElement;
    fireEvent.click(subjectCard);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("সম্পন্ন"));

    // Build the paper from the selected subject.
    fireEvent.click(screen.getByText("প্রশ্নপত্র তৈরি করুন ও PDF নিন"));

    // Preview shows the questions pulled from /api/questions with PDF options.
    expect(await screen.findByText("PDF এক্সপোর্ট অপশন")).toBeInTheDocument();
    expect(screen.getByText("শুদ্ধ বানান কোনটি?")).toBeInTheDocument();
    expect(screen.getByText("গীতাঞ্জলির রচয়িতা কে?")).toBeInTheDocument();

    // Export (without answers) triggers the PDF download without an error.
    fireEvent.click(screen.getByText("উত্তর ছাড়া PDF ডাউনলোড"));
    await waitFor(() => {
      expect(screen.queryByText("PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।")).not.toBeInTheDocument();
    });
  });

  it("previews questions only from the selected topic/subtopic", async () => {
    stubFetch({
      "/api/exam-papers": papersPayload,
      "/api/exam/config": examConfigPayload,
      "/api/questions": { questions: [builderQuestionsPayload.questions[0]] },
    });

    const { EcosystemProvider } = await import("@/lib/ecosystem-ctx");
    const { default: RealExamTab } = await import("@/components/dashboard/RealExamTab");
    render(<EcosystemProvider><RealExamTab /></EcosystemProvider>);

    fireEvent.click(await screen.findByText("নতুন প্রশ্নপত্র তৈরি করুন"));
    expect(await screen.findByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();

    // Pick only the "ভাষা" topic (one question).
    const subjectCard = screen.getByText("বাংলা ভাষা ও সাহিত্য").closest("button") as HTMLElement;
    fireEvent.click(subjectCard);
    fireEvent.click(await screen.findByRole("checkbox", { name: /ভাষা/ }));

    fireEvent.click(screen.getByText("সম্পন্ন"));
    fireEvent.click(screen.getByText("প্রশ্নপত্র তৈরি করুন ও PDF নিন"));

    expect(await screen.findByText("শুদ্ধ বানান কোনটি?")).toBeInTheDocument();
    expect(screen.queryByText("গীতাঞ্জলির রচয়িতা কে?")).not.toBeInTheDocument();
  });
});
