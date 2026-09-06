import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CustomExamTab from "@/components/dashboard/CustomExamTab";
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
    render(<CustomExamTab />);
    expect(await screen.findByText("কাস্টম বিসিএস পরীক্ষা")).toBeInTheDocument();
  });

  it("loads and displays subjects with question counts", async () => {
    render(<CustomExamTab />);
    // Click the summary card to open the modal
    fireEvent.click(await screen.findByText("বিষয় ও টপিক নির্বাচন করুন"));
    expect(await screen.findAllByText("বাংলা ভাষা ও সাহিত্য")).toBeDefined();
    expect(screen.getAllByText("English Language and Literature").length).toBeGreaterThan(0);
  });

  it("selecting a subject updates the live summary", async () => {
    render(<CustomExamTab />);
    // Click the summary card to open the modal
    fireEvent.click(await screen.findByText("বিষয় ও টপিক নির্বাচন করুন"));
    // Select the subject inside the modal (use first match - desktop sidebar)
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);
    // Close the modal by clicking confirm
    fireEvent.click(screen.getByText("শুরু করুন"));

    await waitFor(() => {
      expect(screen.getByText("বিষয়")).toBeInTheDocument();
    });
    // Subject count row shows 1 after selecting the subject.
    const subjectCells = screen.getAllByText("1").filter((el) => el.tagName === "P");
    expect(subjectCells.length).toBeGreaterThan(0);
  });

  it("opens the confirmation modal with a full config summary", async () => {
    render(<CustomExamTab />);
    // Click the summary card to open the modal
    fireEvent.click(await screen.findByText("বিষয় ও টপিক নির্বাচন করুন"));
    // Select the subject inside the modal (use first match)
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);
    // Close the modal by clicking confirm
    fireEvent.click(screen.getByText("শুরু করুন"));

    const startButton = await screen.findByText("কনফিগারেশন রিভিউ করে শুরু করুন");
    fireEvent.click(startButton);

    expect(await screen.findByText("পরীক্ষা নিশ্চিত করুন")).toBeInTheDocument();
    expect(screen.getByText(/সঠিক \+১/)).toBeInTheDocument();
    expect(screen.getByText(/−০\.৫/)).toBeInTheDocument();
  });

  it("per-subject count defaults and feeds the total", async () => {
    render(<CustomExamTab />);
    // Click the summary card to open the modal
    fireEvent.click(await screen.findByText("বিষয় ও টপিক নির্বাচন করুন"));
    // Select the subject inside the modal (use first match)
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);

    const countInputs = screen.getAllByLabelText("প্রশ্ন সংখ্যা");
    expect(countInputs[0]).toHaveValue(10);

    fireEvent.click(screen.getAllByLabelText("প্রশ্ন বাড়ান")[0]);
    expect(countInputs[0]).toHaveValue(11);

    await waitFor(() => {
      expect(screen.getAllByText("11").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("মোট প্রশ্ন")).toBeInTheDocument();
  });

  it("clamps a subject's count to its available questions", async () => {
    render(<CustomExamTab />);
    // Click the summary card to open the modal
    fireEvent.click(await screen.findByText("বিষয় ও টপিক নির্বাচন করুন"));
    // Select the subject inside the modal (use first match)
    const subjectElements = await screen.findAllByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(subjectElements[0]);

    const countInputs = screen.getAllByLabelText("প্রশ্ন সংখ্যা");
    const plusButtons = screen.getAllByLabelText("প্রশ্ন বাড়ান");
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