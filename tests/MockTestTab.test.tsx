import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MockTestTab from "@/components/dashboard/MockTestTab";
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

const subjectFixture: Server.ExamSubjectDTO[] = [
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
    ],
  },
];

const builtExam: Server.ExamBuildResultDTO = {
  examId: "mock-1",
  questions: [
    {
      id: 10,
      subject: "বাংলা ভাষা ও সাহিত্য",
      subjectId: 1,
      topic: "ভাষা",
      subtopic: "বানান ও শুদ্ধি",
      question: "নিচের কোনটি শুদ্ধ বানান?",
      options: ["শুদ্ধ", "ভুল", "ভুল২", "ভুল৩"],
      difficulty: "MEDIUM",
      sourceExam: "BCS",
      year: null,
    },
  ],
  totalQuestions: 1,
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

beforeEach(() => {
  stubFetch({
    "/api/exam/config": { subjects: subjectFixture },
    "/api/exam/build": { exam: builtExam },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MockTestTab (subtopic selection + build)", () => {
  it("drills into a subtopic and starts a timed mock", async () => {
    render(<MockTestTab />);

    // Select the subject → topic tree appears.
    fireEvent.click(await screen.findByText("বাংলা ভাষা ও সাহিত্য"));
    expect(await screen.findByText("ভাষা")).toBeInTheDocument();

    // Expand the topic, then pick a specific subtopic under it.
    fireEvent.click(screen.getByText("ভাষা"));
    fireEvent.click(screen.getByText("বানান ও শুদ্ধি"));

    // Start the mock.
    fireEvent.click(screen.getByText("মক টেস্ট শুরু করুন"));

    // Active phase renders the built question with the timer.
    expect(await screen.findByText("নিচের কোনটি শুদ্ধ বানান?")).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();

    // The build request must carry the selected subtopic path.
    const fetchMock = vi.mocked(fetch);
    const buildCall = fetchMock.mock.calls.find((c) => String(c[0]).startsWith("/api/exam/build"));
    const body = JSON.parse(String(buildCall?.[1]?.body)) as Server.ExamSelectionRequest;
    expect(body.subjects[0].paths).toEqual(["ভাষা/বানান ও শুদ্ধি"]);
    expect(body.durationSec).toBe(1800); // default 30 minutes
  });

  it("shows the available count for a selected subtopic", async () => {
    render(<MockTestTab />);
    fireEvent.click(await screen.findByText("বাংলা ভাষা ও সাহিত্য"));
    fireEvent.click(screen.getByText("ভাষা"));
    fireEvent.click(screen.getByText("বানান ও শুদ্ধি"));

    // Available for the subtopic is 4 (the leaf count).
    expect(screen.getAllByText("4টি").length).toBeGreaterThan(0);
  });
});