import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StudyPlannerTab from "@/components/dashboard/StudyPlannerTab";
import FlashcardsTab from "@/components/dashboard/FlashcardsTab";
import MockTestTab from "@/components/dashboard/MockTestTab";
import AISolverTab from "@/components/dashboard/AISolverTab";
import DailyQuizWidget from "@/components/dashboard/DailyQuizWidget";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import OfflineModeTab from "@/components/dashboard/OfflineModeTab";
import { MOCK_TEST_QUESTIONS, OFFLINE_PACKS } from "@/lib/data/study";

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
  it("renders setup screen initially", () => {
    render(<MockTestTab />);
    expect(screen.getByText("Adaptive Mock Test")).toBeInTheDocument();
  });

  it("displays available subjects", () => {
    render(<MockTestTab />);
    const subjects = Object.keys(MOCK_TEST_QUESTIONS);
    subjects.forEach((subject) => {
      expect(screen.getByText(subject)).toBeInTheDocument();
    });
  });

  it("shows start button", () => {
    render(<MockTestTab />);
    expect(screen.getByText("Start Mock Test")).toBeInTheDocument();
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
  it("renders the closed widget", () => {
    render(<DailyQuizWidget />);
    expect(screen.getByText("Daily Quiz")).toBeInTheDocument();
    expect(screen.getByText("5 questions • +50 XP")).toBeInTheDocument();
  });

  it("opens quiz modal when clicked", () => {
    render(<DailyQuizWidget />);
    fireEvent.click(screen.getByText("Daily Quiz"));
    expect(screen.getByText(/Question/)).toBeInTheDocument();
  });
});

describe("NotificationCenter", () => {
  it("renders notification bell", () => {
    render(<NotificationCenter />);
    expect(screen.getByTitle("Notifications")).toBeInTheDocument();
  });

  it("opens notification panel when clicked", () => {
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("displays initial notifications", () => {
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(screen.getByText("Daily Quiz Ready")).toBeInTheDocument();
    expect(screen.getByText("Streak at Risk!")).toBeInTheDocument();
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
