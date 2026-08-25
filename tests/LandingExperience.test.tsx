import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import IntelligenceSection from "@/components/landing/IntelligenceSection";
import SignalFlow from "@/components/landing/SignalFlow";
import AdaptivePracticeSection from "@/components/landing/AdaptivePracticeSection";
import TutorSection from "@/components/landing/TutorSection";
import ExamEngineSection from "@/components/landing/ExamEngineSection";
import SubjectUniverseSection from "@/components/landing/SubjectUniverseSection";
import AnalyticsSection from "@/components/landing/AnalyticsSection";
import PlannerSection from "@/components/landing/PlannerSection";
import PhilosophySection from "@/components/landing/PhilosophySection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import BackToTop from "@/components/ui/BackToTop";

describe("BackToTop", () => {
  it("renders an accessible control that is hidden until scrolled", () => {
    render(<BackToTop />);
    const button = screen.getByRole("button", { name: /back to top/i });
    // Hidden state pre-scroll: removed from tab order and faded out.
    expect(button).toHaveAttribute("tabindex", "-1");
    expect(button.className).toContain("opacity-0");
  });
});

describe("HeroSection", () => {
  it("renders the spec copy and both CTAs", () => {
    render(<HeroSection />);
    expect(screen.getByText(/AI-Powered Application/i)).toBeInTheDocument();
    expect(screen.getByText(/Built for Job Aspirants/i)).toBeInTheDocument();

    // MotionText splits headlines into per-word spans (NBSP separators).
    const h1 = screen.getByRole("heading", { level: 1 });
    const h1Text = (h1.textContent ?? "").replace(/\u00A0/g, " ");
    expect(h1Text).toContain("Stop guessing.");
    expect(h1Text).toContain("Start passing.");

    expect(screen.getByText(/AI that learns your weak spots/i)).toBeInTheDocument();

    const primary = screen.getByRole("link", { name: /Start for free/i });
    expect(primary).toHaveAttribute("href", "/login?register=true");

    const secondary = screen.getByRole("link", { name: /See how it works/i });
    expect(secondary).toHaveAttribute("href", "#signal");
  });

  it("renders the 14 Subjects · 2 Languages · 100% Free stat row", () => {
    render(<HeroSection />);
    expect(screen.getAllByText("14").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    for (const label of ["Subjects", "Languages", "Free"]) {
      // Labels appear twice by design: visible span + sr-only <dt>.
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("ProblemSection", () => {
  it("keeps the three friction cards", () => {
    render(<ProblemSection />);
    expect(screen.getByText("Resources are scattered")).toBeInTheDocument();
    expect(screen.getByText("Plans are generic")).toBeInTheDocument();
    expect(screen.getByText("Feedback comes too late")).toBeInTheDocument();
  });
});

describe("IntelligenceSection", () => {
  it("renders heading, mobile intelligence map, and decorative-graph hiding", () => {
    const { container } = render(<IntelligenceSection />);
    expect(container.textContent).toMatch(/everything you know/i);

    // Mobile vertical map exposes the six stages semantically
    const list = screen.getByRole("list", { name: /knowledge model/i });
    expect(list.querySelectorAll("li")).toHaveLength(6);

    // Decorative desktop graph must be hidden from AT
    expect(container.querySelector("[aria-hidden='true'] svg")).toBeTruthy();
    expect(
      container.querySelector(".lg\\:block[aria-hidden='true']"),
    ).toBeTruthy();
  });
});

describe("SignalFlow", () => {
  it("announces the simulated outcome through aria-live", async () => {
    const user = userEvent.setup();
    render(<SignalFlow />);

    await user.click(screen.getByRole("button", { name: /^correct answer/i }));
    expect(
      screen.getByText(/signal strengthens the pathway/i),
    ).toBeInTheDocument();
  });

  it("announces the incorrect-answer redirect", async () => {
    const user = userEvent.setup();
    render(<SignalFlow />);

    await user.click(screen.getByRole("button", { name: /^incorrect answer/i }));
    expect(
      screen.getByText(/exposes a weak concept/i),
    ).toBeInTheDocument();
  });
});

describe("Section anchor contracts", () => {
  it("AdaptivePracticeSection owns #features", () => {
    const { container } = render(<AdaptivePracticeSection />);
    expect(container.querySelector("section#features")).toBeTruthy();
  });

  it("SubjectUniverseSection owns #syllabus", () => {
    const { container } = render(<SubjectUniverseSection />);
    expect(container.querySelector("section#syllabus")).toBeTruthy();
  });
});

describe("TutorSection", () => {
  it("renders all five reasoning stages", () => {
    render(<TutorSection />);
    for (const stage of [
      "Candidate Question",
      "AI Identifies Concepts",
      "Knowledge Nodes Illuminate",
      "Explanation Path Forms",
      "Understanding Expands",
    ]) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });
});

describe("ExamEngineSection", () => {
  it("links the four track cards to their /tracks anchors", () => {
    render(<ExamEngineSection />);
    const expected = [
      ["/tracks#bcs-preliminary", /BCS/],
      ["/tracks#bank-jobs", /Bangladesh Bank/],
      ["/tracks#teacher-recruitment", /NTRCA/],
      ["/tracks#psc-and-other", /Other Govt Exams/],
    ] as const;
    for (const [href, name] of expected) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});

describe("SubjectUniverseSection", () => {
  it("renders all nine subjects and reveals coverage on selection", async () => {
    const user = userEvent.setup();
    render(<SubjectUniverseSection />);
    for (const subject of [
      "Bangla",
      "English",
      "Mathematics",
      "Bangladesh Affairs",
      "International Affairs",
      "General Science",
      "ICT",
      "Mental Ability",
      "Current Affairs",
    ]) {
      expect(screen.getAllByText(subject).length).toBeGreaterThan(0);
    }

    await user.click(screen.getByRole("button", { name: "Mathematics" }));
    expect(screen.getByText(/1,656 questions · ~64h guided study/)).toBeInTheDocument();
  });

  it("labels Current Affairs honestly instead of inventing a count", async () => {
    const user = userEvent.setup();
    render(<SubjectUniverseSection />);
    await user.click(screen.getByRole("button", { name: "Current Affairs" }));
    expect(
      screen.getByText(/updated daily · linked to the current-affairs feed/i),
    ).toBeInTheDocument();
  });
});

describe("AnalyticsSection", () => {
  it("marks itself as a sample preview", () => {
    render(<AnalyticsSection />);
    expect(screen.getAllByText(/sample preview/i).length).toBeGreaterThan(0);
  });
});

describe("PlannerSection", () => {
  it("keeps the five planner stages", () => {
    render(<PlannerSection />);
    for (const stage of [
      "Weak Topic",
      "Concept Review",
      "Practice",
      "Revision",
      "Mastery",
    ]) {
      expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    }
  });
});

describe("PhilosophySection", () => {
  it("renders the three-line statement as crawlable text", () => {
    render(<PhilosophySection />);
    expect(screen.getByText(/MEASURE/)).toBeInTheDocument();
    expect(screen.getByText(/UNDERSTAND/)).toBeInTheDocument();
    expect(screen.getByText(/IMPROVE/)).toBeInTheDocument();
  });
});

describe("FinalCtaSection", () => {
  it("renders the closing copy and preserves CTA routes", () => {
    render(<FinalCtaSection />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect((h2.textContent ?? "").replace(/\u00A0/g, " ").toLowerCase()).toContain(
      "build your advantage.",
    );

    const start = screen.getByRole("link", { name: /Start Preparing/i });
    expect(start).toHaveAttribute("href", "/login?register=true");

    const explore = screen.getByRole("link", { name: /Explore the Platform/i });
    expect(explore).toHaveAttribute("href", "/tracks");
  });
});
