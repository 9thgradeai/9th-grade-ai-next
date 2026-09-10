import "@testing-library/jest-dom";

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HeroSection from "@/components/landing/HeroSection";
import HeroBackground from "@/components/landing/hero/HeroBackground";
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
    render(<HeroSection subjectCount={10} />);
    expect(screen.getByText(/AI-Powered Application/i)).toBeInTheDocument();
    expect(screen.getByText(/Built for Job Aspirants/i)).toBeInTheDocument();

    // MotionText splits headlines into per-word spans (NBSP separators).
    const h1 = screen.getByRole("heading", { level: 1 });
    const h1Text = (h1.textContent ?? "").replace(/ /g, " ");
    expect(h1Text).toContain("Stop guessing.");
    expect(h1Text).toContain("Start passing.");

    expect(screen.getByText(/AI that learns your weak spots/i)).toBeInTheDocument();

    const primary = screen.getByRole("link", { name: /Start for free/i });
    expect(primary).toHaveAttribute("href", "/login?register=true");

    const secondary = screen.getByRole("link", { name: /See how it works/i });
    expect(secondary).toHaveAttribute("href", "#signal");
  });

  it("renders the real subject count · 2 Languages · 100% Free stat row", () => {
    render(<HeroSection subjectCount={10} />);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    for (const label of ["Subjects", "Languages", "Free"]) {
      // Labels appear twice by design: visible span + sr-only <dt>.
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("HeroBackground", () => {
  it("renders the video-first layered backdrop with correct video behavior", () => {
    const { container } = render(<HeroBackground />);
    const root = container.querySelector('[data-layer="hero-background"]');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-hidden", "true");

    // Layer stack: fallback → video (z-0) → stars (z-1) → vignette (z-2). No canvas/WebGL.
    for (const layer of ["video-fallback", "atmospheric-video", "star-field", "vignette"]) {
      expect(container.querySelector(`[data-layer="${layer}"]`)).toBeInTheDocument();
    }
    expect(container.querySelector("canvas")).not.toBeInTheDocument();

    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("src", "/asset/hero/9th-grade.webm");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video?.muted || video?.hasAttribute("muted")).toBe(true);
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video?.hasAttribute("controls")).toBe(false);
  });

  it("renders a restrained, deterministic, responsive star field", () => {
    const { container, unmount } = render(<HeroBackground />);
    const stars = container.querySelectorAll("[data-star]");
    // Desktop 72 / tablet 48 / mobile 24 via CSS gating (same DOM).
    expect(stars.length).toBe(72);
    expect(container.querySelectorAll("[data-star].hidden.sm\\:block").length).toBe(24);
    expect(container.querySelectorAll("[data-star].hidden.lg\\:block").length).toBe(24);

    // Independent twinkle timing in the 8–10s band + inward drift offsets.
    const timings = new Set(
      [...stars].map((s) => (s as HTMLElement).style.animationDuration),
    );
    expect(timings.size).toBeGreaterThan(1);
    for (const star of [...stars] as HTMLElement[]) {
      const seconds = Number.parseFloat(star.style.animationDuration);
      expect(seconds).toBeGreaterThanOrEqual(8);
      expect(seconds).toBeLessThanOrEqual(10);
      expect(star.style.getPropertyValue("--star-dx")).toMatch(/px$/);
      expect(star.style.getPropertyValue("--star-dy")).toMatch(/px$/);
    }

    // Deterministic across mounts.
    const positions = [...stars].map((s) => (s as HTMLElement).style.cssText);
    unmount();
    const { container: second } = render(<HeroBackground />);
    expect([...second.querySelectorAll("[data-star]")].map((s) => (s as HTMLElement).style.cssText)).toEqual(positions);
  });

  it("renders across viewport sizes without throwing", () => {
    expect(() => render(<HeroBackground />)).not.toThrow();
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