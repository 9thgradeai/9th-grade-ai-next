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
    groups: [
      {
        groupName: "ভাষা (১৫ নম্বর)",
        questionCount: 10,
        subTopics: [
          { name: "বানান ও শুদ্ধি", questionCount: 4 },
          { name: "পরিভাষা", questionCount: 6 },
        ],
      },
      {
        groupName: "সাহিত্য (১৫ নম্বর)",
        questionCount: 10,
        subTopics: [{ name: "আধুনিক যুগ", questionCount: 10 }],
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
    groups: [],
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
    expect(await screen.findByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();
    expect(screen.getByText("English Language and Literature")).toBeInTheDocument();
    expect(screen.getAllByText("20টি প্রশ্ন").length).toBeGreaterThan(0);
  });

  it("selecting a subject updates the live summary", async () => {
    render(<CustomExamTab />);
    await screen.findByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(screen.getByText("বাংলা ভাষা ও সাহিত্য"));

    await waitFor(() => {
      expect(screen.getByText("বিষয়")).toBeInTheDocument();
    });
    // Subject count row shows 1 after selecting the subject.
    const subjectCells = screen.getAllByText("1").filter((el) => el.tagName === "P");
    expect(subjectCells.length).toBeGreaterThan(0);
  });

  it("opens the confirmation modal with a full config summary", async () => {
    render(<CustomExamTab />);
    await screen.findByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(screen.getByText("বাংলা ভাষা ও সাহিত্য"));

    const startButton = await screen.findByText("কনফিগারেশন রিভিউ করে শুরু করুন");
    fireEvent.click(startButton);

    expect(await screen.findByText("পরীক্ষা নিশ্চিত করুন")).toBeInTheDocument();
    expect(screen.getByText(/সঠিক \+১/)).toBeInTheDocument();
    expect(screen.getByText(/−০\.৫/)).toBeInTheDocument();
  });

  it("shows a warning when the requested count exceeds availability", async () => {
    render(<CustomExamTab />);
    await screen.findByText("বাংলা ভাষা ও সাহিত্য");
    fireEvent.click(screen.getByText("বাংলা ভাষা ও সাহিত্য"));

    // Raise question count beyond available via the plus button repeatedly.
    const plus = screen.getByLabelText("বাড়ান");
    fireEvent.click(plus); // 11
    fireEvent.click(plus); // 12
    fireEvent.click(plus); // 13
    fireEvent.click(plus); // 14
    fireEvent.click(plus); // 15
    fireEvent.click(plus); // 16
    fireEvent.click(plus); // 17
    fireEvent.click(plus); // 18
    fireEvent.click(plus); // 19
    fireEvent.click(plus); // 20
    fireEvent.click(plus); // 21

    await waitFor(() => {
      expect(screen.getByText(/শুধু/)).toBeInTheDocument();
    });
  });
});