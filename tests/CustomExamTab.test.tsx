import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import CustomExamTab from "@/components/dashboard/CustomExamTab";
import { EcosystemProvider } from "@/lib/ecosystem-ctx";
import type { Server } from "@/lib/types";

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const match = Object.keys(routes).find((r) => url.startsWith(r));
      if (!match) {
        return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => routes[match] } as Response;
    }),
  );
}

const subjects: Server.ExamSubjectDTO[] = [
  {
    id: 1,
    nameBn: "বাংলা ভাষা ও সাহিত্য",
    nameEn: "Bangla",
    icon: "📖",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    questionCount: 20,
    nodes: [
      {
        id: 1,
        name: "ভাষা",
        path: "ভাষা",
        depth: 1,
        questionCount: 10,
        children: [
          { id: 2, name: "বানান ও শুদ্ধি", path: "ভাষা/বানান ও শুদ্ধি", depth: 2, questionCount: 4, children: [] },
          { id: 3, name: "পরিভাষা", path: "ভাষা/পরিভাষা", depth: 2, questionCount: 6, children: [] },
        ],
      },
      {
        id: 4,
        name: "সাহিত্য",
        path: "সাহিত্য",
        depth: 1,
        questionCount: 10,
        children: [{ id: 5, name: "আধুনিক যুগ", path: "সাহিত্য/আধুনিক যুগ", depth: 2, questionCount: 10, children: [] }],
      },
    ],
  },
  {
    id: 2,
    nameBn: "English Language and Literature",
    nameEn: "English",
    icon: "📚",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    questionCount: 20,
    nodes: [
      { id: 6, name: "Grammar", path: "Grammar", depth: 1, questionCount: 20, children: [] },
    ],
  },
];

beforeEach(() => {
  stubFetch({ "/api/exam/config": { subjects } });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CustomExamTab (config phase)", () => {
  it("renders the exam builder header", async () => {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    expect(await screen.findByText("কাস্টম বিসিএস পরীক্ষা")).toBeInTheDocument();
  });

  it("loads and displays subjects with question counts", async () => {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    // Subjects are shown inline without needing to open any modal.
    expect(await screen.findAllByText("বাংলা ভাষা ও সাহিত্য")).toBeDefined();
    expect(screen.getAllByText("English Language and Literature").length).toBeGreaterThan(0);
  });

  it("selecting a subject updates the live summary", async () => {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    // Click a subject card directly to select it.
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);

    await waitFor(() => {
      expect(screen.getByText("বিষয়")).toBeInTheDocument();
    });
    // Subject count row shows 1 after selecting the subject.
    const subjectCells = screen.getAllByText("1").filter((el) => el.tagName === "P");
    expect(subjectCells.length).toBeGreaterThan(0);
  });

  it("opens the confirmation modal with a full config summary", async () => {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    // Select a subject directly from the inline picker.
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);

    const startButton = await screen.findByText("কনফিগারেশন রিভিউ করে শুরু করুন");
    fireEvent.click(startButton);

    expect(await screen.findByText("পরীক্ষা নিশ্চিত করুন")).toBeInTheDocument();
    expect(screen.getByText(/সঠিক \+১/)).toBeInTheDocument();
    expect(screen.getByText(/−০\.৫/)).toBeInTheDocument();
  });

  it("per-subject count defaults and feeds the total", async () => {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);

    const countInputs = screen.getAllByLabelText(/প্রশ্ন সংখ্যা/);
    expect(countInputs[0]).toHaveValue(10);

    fireEvent.click(screen.getAllByLabelText(/প্রশ্ন বাড়ান/)[0]);
    expect(countInputs[0]).toHaveValue(11);

    await waitFor(() => {
      expect(screen.getAllByText("11").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("মোট প্রশ্ন")).toBeInTheDocument();
  });

  it("clamps a subject's count to its available questions", async () => {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);

    const countInputs = screen.getAllByLabelText(/প্রশ্ন সংখ্যা/);
    const plusButtons = screen.getAllByLabelText(/প্রশ্ন বাড়ান/);
    const plus = plusButtons[0];
    for (let i = 0; i < 15; i++) {
      fireEvent.click(plus);
    }

    // Available for the whole subject is 20 — the count clamps there.
    expect(countInputs[0]).toHaveValue(20);
    await waitFor(() => {
      expect(screen.getAllByText("20").length).toBeGreaterThan(0);
    });
  });
});

describe("CustomExamTab — results review colors + jump tiles", () => {
  const multiExam: Server.ExamBuildResultDTO = {
    examId: "exam-custom-results",
    questions: [
      { id: 10, subject: "বাংলা ভাষা ও সাহিত্য", subjectId: 1, topic: "ভাষা", subtopic: "বানান ও শুদ্ধি", question: "প্রশ্ন ১", options: ["ক", "খ", "গ", "ঘ"], difficulty: "MEDIUM", sourceExam: "BCS", year: null },
      { id: 11, subject: "বাংলা ভাষা ও সাহিত্য", subjectId: 1, topic: "ভাষা", subtopic: "বানান ও শুদ্ধি", question: "প্রশ্ন ২", options: ["ক", "খ", "গ", "ঘ"], difficulty: "MEDIUM", sourceExam: "BCS", year: null },
      { id: 12, subject: "বাংলা ভাষা ও সাহিত্য", subjectId: 1, topic: "ভাষা", subtopic: "বানান ও শুদ্ধি", question: "প্রশ্ন ৩", options: ["ক", "খ", "গ", "ঘ"], difficulty: "EASY", sourceExam: "BCS", year: null },
    ],
    totalQuestions: 3,
    requested: 10,
    available: 4,
    shortfall: 6,
    durationSec: 600,
    config: {
      subjects: [{ subjectId: 1, paths: ["ভাষা/বানান ও শুদ্ধি"], count: 10 }],
      questionCount: 10,
      durationSec: 600,
    },
  };

  const submitResult = {
    result: {
      summary: {
        total: 3,
        attempted: 1,
        correct: 1,
        wrong: 1,
        unanswered: 1,
        positiveMarks: 1,
        negativeMarks: 0.5,
        finalScore: 1,
        accuracy: 100,
        percentage: 100,
        pointsEarned: 10,
      },
      review: [
        { questionId: 10, subject: "বাংলা ভাষা ও সাহিত্য", topic: "ভাষা", subtopic: "বানান ও শুদ্ধি", question: "প্রশ্ন ১", options: ["ক", "খ", "গ", "ঘ"], correctAnswer: "ক", explanation: "", userAnswer: "ক", status: "correct" as const, marks: 1, masteryStatus: null, justMastered: false },
        { questionId: 11, subject: "বাংলা ভাষা ও সাহিত্য", topic: "ভাষা", subtopic: "বানান ও শুদ্ধি", question: "প্রশ্ন ২", options: ["ক", "খ", "গ", "ঘ"], correctAnswer: "খ", explanation: "", userAnswer: "ক", status: "wrong" as const, marks: -0.5, masteryStatus: null, justMastered: false },
        { questionId: 12, subject: "বাংলা ভাষা ও সাহিত্য", topic: "ভাষা", subtopic: "বানান ও শুদ্ধি", question: "প্রশ্ন ৩", options: ["ক", "খ", "গ", "ঘ"], correctAnswer: "গ", explanation: "", userAnswer: "", status: "unanswered" as const, marks: 0, masteryStatus: null, justMastered: false },
      ],
      attemptId: "z",
      outcome: "submitted",
      submittedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  beforeEach(() => {
    stubFetch({
      "/api/exam/config": { subjects },
      "/api/exam/build": { exam: multiExam },
      "/api/exam/start": { attemptId: "z", status: "IN_PROGRESS" },
      "/api/exam/submit": submitResult,
      "/api/exams": submitResult,
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function submitExamWithOneAnswer() {
    render(<EcosystemProvider><CustomExamTab /></EcosystemProvider>);
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);
    fireEvent.click(await screen.findByText("কনফিগারেশন রিভিউ করে শুরু করুন"));
    fireEvent.click(await screen.findByText("পরীক্ষা শুরু করুন"));

    const firstQuestion = await screen.findByText("প্রশ্ন ১");
    const card = firstQuestion.closest("div[id^='exam-q-']") as HTMLElement | null;
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByText("ক"));

    fireEvent.click(screen.getByText("জমা দিন"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("জমা দিন"));

    expect(await screen.findByText("পরীক্ষা সম্পন্ন!")).toBeInTheDocument();
  }

  it("colors correct green, wrong red and unanswered teal on the result tiles", async () => {
    await submitExamWithOneAnswer();

    const correctTile = screen.getByRole("button", { name: /সঠিক 1টি/ });
    expect(correctTile.className).toContain("dashboard-success");
    const wrongTile = screen.getByRole("button", { name: /ভুল 1টি/ });
    expect(wrongTile.className).toContain("dashboard-danger");
    const unansweredTile = screen.getByRole("button", { name: /উত্তর দেওয়া হয়নি 1টি/ });
    expect(unansweredTile.className).toContain("dashboard-teal");

    expect(document.getElementById("exam-review-correct")).not.toBeNull();
    expect(document.getElementById("exam-review-wrong")).not.toBeNull();
    expect(document.getElementById("exam-review-unanswered")).not.toBeNull();
  });

  it("clicking a result tile jumps to (scrolls + highlights) the matching review row", async () => {
    await submitExamWithOneAnswer();

    const origScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
    try {
      fireEvent.click(screen.getByRole("button", { name: /উত্তর দেওয়া হয়নি 1টি/ }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      const unansweredRow = document.getElementById("exam-review-unanswered");
      expect(unansweredRow!.className).toContain("ring-2");
      expect(unansweredRow!.className).toContain("ring-[var(--dashboard-teal)]");
    } finally {
      Element.prototype.scrollIntoView = origScrollIntoView;
    }
  });
});