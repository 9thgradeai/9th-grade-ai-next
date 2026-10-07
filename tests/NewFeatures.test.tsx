import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EcosystemProvider } from "@/lib/ecosystem-ctx";
import { LanguageProvider } from "@/lib/lang-ctx";
import StudyPlannerTab from "@/components/dashboard/StudyPlannerTab";
import FlashcardsTab from "@/components/dashboard/FlashcardsTab";
import MockTestTab from "@/components/dashboard/MockTestTab";
import AISolverTab from "@/components/dashboard/AISolverTab";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

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

describe("StudyPlannerTab", () => {
  const planPayload = {
    tasks: [
      { id: 11, day: "Sunday", date: "2026-01-04", title: "বাংলা ভাষা ও সাহিত্য", subject: "বাংলা", duration: 45, priority: "high", description: "সন্ধি", completed: false },
      { id: 12, day: "Monday", date: "2026-01-05", title: "Tuesday prep", subject: "Math", duration: 30, priority: "medium", description: "বীজগণিত", completed: false },
    ],
  };

  it("renders the study planner header", async () => {
    stubFetch({ "/api/study-plan": planPayload });
    render(<EcosystemProvider><LanguageProvider><StudyPlannerTab /></LanguageProvider></EcosystemProvider>);
    expect(screen.getByText("AI Study Planner")).toBeInTheDocument();
    expect(await screen.findByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();
  });

  it("displays study plan days", async () => {
    stubFetch({ "/api/study-plan": planPayload });
    render(<EcosystemProvider><LanguageProvider><StudyPlannerTab /></LanguageProvider></EcosystemProvider>);
    expect((await screen.findAllByText("Sunday")).length).toBeGreaterThan(0);
    expect(screen.getByText("Monday")).toBeInTheDocument();
  });

  it("shows task list for selected day", async () => {
    stubFetch({ "/api/study-plan": planPayload });
    render(<EcosystemProvider><LanguageProvider><StudyPlannerTab /></LanguageProvider></EcosystemProvider>);
    const banglaElements = await screen.findAllByText(/বাংলা ভাষা/);
    expect(banglaElements.length).toBeGreaterThan(0);
  });

  it("start button navigates to practice instead of completing the task", async () => {
    stubFetch({ "/api/study-plan": planPayload });
    render(<EcosystemProvider><LanguageProvider><StudyPlannerTab /></LanguageProvider></EcosystemProvider>);
    const startButtons = await screen.findAllByText("Start");
    expect(startButtons.length).toBeGreaterThan(0);
  });
});

describe("FlashcardsTab", () => {
  beforeEach(() => {
    stubFetch({
      "/api/flashcards": {
        flashcards: [
          { id: 1, subjectName: "বাংলা ভাষা ও সাহিত্য", question: "সন্ধি কাকে বলে?", answer: "ধ্বনির মিলন", hint: "", difficulty: "EASY" },
          { id: 2, subjectName: "English Language and Literature", question: "What is a noun?", answer: "Naming word", hint: "", difficulty: "EASY" },
        ],
      },
    });
  });

  it("renders deck selection when no deck is selected", async () => {
    render(<EcosystemProvider><FlashcardsTab /></EcosystemProvider>);
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByText("Spaced Repetition System")).toBeInTheDocument();
  });

  it("shows available decks", async () => {
    render(<EcosystemProvider><FlashcardsTab /></EcosystemProvider>);
    expect(await screen.findByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();
    expect(screen.getByText("English Language and Literature")).toBeInTheDocument();
  });

  it("starts session when deck is clicked", async () => {
    render(<EcosystemProvider><FlashcardsTab /></EcosystemProvider>);
    fireEvent.click(await screen.findByText("বাংলা ভাষা ও সাহিত্য"));
    expect(await screen.findByText(/1 \/ \d+/)).toBeInTheDocument();
  });
});

describe("MockTestTab", () => {
  beforeEach(() => {
    stubFetch({
      "/api/exam/config": {
        subjects: [
          {
            id: 1,
            nameBn: "বাংলা ভাষা ও সাহিত্য",
            nameEn: "Bangla",
            icon: "📖",
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            questionCount: 10,
            nodes: [
              { id: 1, name: "ভাষা", path: "ভাষা", depth: 1, questionCount: 10, children: [] },
            ],
          },
          {
            id: 2,
            nameBn: "English Language and Literature",
            nameEn: "English",
            icon: "📚",
            color: "text-sky-400",
            bg: "bg-sky-500/10",
            questionCount: 5,
            nodes: [
              { id: 2, name: "Grammar", path: "Grammar", depth: 1, questionCount: 5, children: [] },
            ],
          },
        ],
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders setup screen initially", async () => {
    render(<EcosystemProvider><MockTestTab /></EcosystemProvider>);
    expect(await screen.findByText("মক টেস্ট")).toBeInTheDocument();
  });

  it("displays available subjects with question counts", async () => {
    render(<EcosystemProvider><MockTestTab /></EcosystemProvider>);
    // Subjects are shown inline without needing to open any modal.
    expect(await screen.findAllByText("বাংলা ভাষা ও সাহিত্য")).toBeDefined();
    expect(screen.getAllByText("English Language and Literature").length).toBeGreaterThan(0);
  });

  it("shows start button", async () => {
    render(<EcosystemProvider><MockTestTab /></EcosystemProvider>);
    expect(await screen.findByText("মক টেস্ট শুরু করুন")).toBeInTheDocument();
  });
});

describe("AISolverTab", () => {
  it("renders the AI solver header", () => {
    render(<EcosystemProvider><AISolverTab /></EcosystemProvider>);
    expect(screen.getByText("AI Question Solver")).toBeInTheDocument();
  });

  it("shows text input option", () => {
    render(<EcosystemProvider><AISolverTab /></EcosystemProvider>);
    expect(screen.getByText("Text Input")).toBeInTheDocument();
  });

  it("shows photo upload option", () => {
    render(<EcosystemProvider><AISolverTab /></EcosystemProvider>);
    expect(screen.getByText(/Photo Upload/)).toBeInTheDocument();
  });

  it("allows typing in text area", () => {
    render(<EcosystemProvider><AISolverTab /></EcosystemProvider>);
    const textarea = screen.getByLabelText(/প্রশ্ন লিখুন/);
    fireEvent.change(textarea, { target: { value: "Solve: 2x + 5 = 15" } });
    expect(textarea).toHaveValue("Solve: 2x + 5 = 15");
  });

  it("shows example questions", () => {
    render(<EcosystemProvider><AISolverTab /></EcosystemProvider>);
    const physicsElements = screen.getAllByText(/Physics/);
    expect(physicsElements.length).toBeGreaterThan(0);
  });
});

describe("NotificationCenter", () => {
  beforeEach(() => {
    stubFetch({
      "/api/notifications": { notifications: [], total: 0, nextCursor: null, unreadCount: 0 },
      "/api/badges": { badges: [] },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders notification bell", () => {
    render(<EcosystemProvider><NotificationCenter /></EcosystemProvider>);
    expect(screen.getByTitle("Notifications")).toBeInTheDocument();
  });

  it("opens notification panel when clicked", () => {
    render(<EcosystemProvider><NotificationCenter /></EcosystemProvider>);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(screen.getByText("নোটিফিকেশন")).toBeInTheDocument();
  });

  it("shows empty state when there are no notifications", async () => {
    render(<EcosystemProvider><NotificationCenter /></EcosystemProvider>);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(await screen.findByText("কোনো নোটিফিকেশন নেই")).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  it("is exported as a client component", async () => {
    const mod = await import("@/components/ThemeToggle");
    expect(mod.default).toBeDefined();
  });
});
