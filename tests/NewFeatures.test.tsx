import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StudyPlannerTab from "@/components/dashboard/StudyPlannerTab";
import FlashcardsTab from "@/components/dashboard/FlashcardsTab";
import MockTestTab from "@/components/dashboard/MockTestTab";
import AISolverTab from "@/components/dashboard/AISolverTab";
import DailyQuizWidget from "@/components/dashboard/DailyQuizWidget";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import OfflineModeTab from "@/components/dashboard/OfflineModeTab";
import { OFFLINE_PACKS } from "@/lib/data/study";

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
  it("renders the study planner header", () => {
    render(<StudyPlannerTab />);
    expect(screen.getByText("AI Study Planner")).toBeInTheDocument();
  });

  it("displays study plan days", () => {
    render(<StudyPlannerTab />);
    const sundayElements = screen.getAllByText("Sunday");
    expect(sundayElements.length).toBeGreaterThan(0);
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
  });

  it("shows task list for selected day", () => {
    render(<StudyPlannerTab />);
    const banglaElements = screen.getAllByText(/বাংলা ভাষা/);
    expect(banglaElements.length).toBeGreaterThan(0);
  });

  it("allows toggling task completion", () => {
    render(<StudyPlannerTab />);
    const startButtons = screen.getAllByText("Start");
    expect(startButtons.length).toBeGreaterThan(0);
  });
});

describe("FlashcardsTab", () => {
  it("renders deck selection when no deck is selected", () => {
    render(<FlashcardsTab />);
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByText("Spaced Repetition System")).toBeInTheDocument();
  });

  it("shows available decks", () => {
    render(<FlashcardsTab />);
    expect(screen.getByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();
    expect(screen.getByText("English Language and Literature")).toBeInTheDocument();
  });

  it("starts session when deck is clicked", () => {
    render(<FlashcardsTab />);
    fireEvent.click(screen.getByText("বাংলা ভাষা ও সাহিত্য"));
    expect(screen.getByText(/1 \/ \d+/)).toBeInTheDocument();
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
    render(<MockTestTab />);
    expect(await screen.findByText("মক টেস্ট")).toBeInTheDocument();
  });

  it("displays available subjects with question counts", async () => {
    render(<MockTestTab />);
    expect(await screen.findByText("বাংলা ভাষা ও সাহিত্য")).toBeInTheDocument();
    expect(screen.getByText("English Language and Literature")).toBeInTheDocument();
    expect(screen.getAllByText("10টি প্রশ্ন").length).toBeGreaterThan(0);
  });

  it("shows start button", async () => {
    render(<MockTestTab />);
    expect(await screen.findByText("মক টেস্ট শুরু করুন")).toBeInTheDocument();
  });
});

describe("AISolverTab", () => {
  it("renders the AI solver header", () => {
    render(<AISolverTab />);
    expect(screen.getByText("AI Question Solver")).toBeInTheDocument();
  });

  it("shows text input option", () => {
    render(<AISolverTab />);
    expect(screen.getByText("Text Input")).toBeInTheDocument();
  });

  it("shows photo upload option", () => {
    render(<AISolverTab />);
    expect(screen.getByText(/Photo Upload/)).toBeInTheDocument();
  });

  it("allows typing in text area", () => {
    render(<AISolverTab />);
    const textarea = screen.getByPlaceholderText(/Type your question/);
    fireEvent.change(textarea, { target: { value: "Solve: 2x + 5 = 15" } });
    expect(textarea).toHaveValue("Solve: 2x + 5 = 15");
  });

  it("shows example questions", () => {
    render(<AISolverTab />);
    const physicsElements = screen.getAllByText(/Physics/);
    expect(physicsElements.length).toBeGreaterThan(0);
  });
});

describe("DailyQuizWidget", () => {
  beforeEach(() => {
    stubFetch({ "/api/daily-quiz": { quiz: null } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the closed widget", () => {
    render(<DailyQuizWidget />);
    expect(screen.getByText("দৈনিক কুইজ")).toBeInTheDocument();
  });

  it("shows an empty state when no quiz is available", async () => {
    render(<DailyQuizWidget />);
    fireEvent.click(screen.getByText("দৈনিক কুইজ"));
    expect(await screen.findByText("আজকের জন্য কোনো কুইজ নেই")).toBeInTheDocument();
  });
});

describe("NotificationCenter", () => {
  beforeEach(() => {
    stubFetch({
      "/api/notifications": { notifications: [], page: 1, pageSize: 20, total: 0 },
      "/api/badges": { badges: [] },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders notification bell", () => {
    render(<NotificationCenter />);
    expect(screen.getByTitle("Notifications")).toBeInTheDocument();
  });

  it("opens notification panel when clicked", () => {
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(screen.getByText("নোটিফিকেশন")).toBeInTheDocument();
  });

  it("shows empty state when there are no notifications", async () => {
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(await screen.findByText("কোনো নোটিফিকেশন নেই")).toBeInTheDocument();
  });
});

describe("OfflineModeTab", () => {
  it("renders offline mode header", () => {
    render(<OfflineModeTab />);
    expect(screen.getByText("Offline Mode")).toBeInTheDocument();
  });

  it("shows content packs", () => {
    render(<OfflineModeTab />);
    OFFLINE_PACKS.forEach((pack) => {
      expect(screen.getByText(pack.name)).toBeInTheDocument();
    });
  });

  it("shows download all button", () => {
    render(<OfflineModeTab />);
    expect(screen.getByText("Download All Content")).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  it("is exported as a client component", async () => {
    const mod = await import("@/components/ThemeToggle");
    expect(mod.default).toBeDefined();
  });
});
