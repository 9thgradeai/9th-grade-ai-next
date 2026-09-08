import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import HeroSection from "@/components/landing/HeroSection";
import HeroVisual from "@/components/landing/hero/HeroVisual";
import KnowledgeField from "@/components/landing/hero/KnowledgeField";

describe("HeroGalaxy", () => {
  let originalMatchMedia: typeof window.matchMedia;
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    matchMediaMock = vi.fn((query: string) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return { matches: true, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
      }
      if (query === "(pointer: fine)") {
        return { matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
      }
      return { matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
    });
    window.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("HeroSection renders headline and CTAs", () => {
    render(<HeroSection subjectCount={10} />);
    // WordReveal splits text with NBSP - need to check via textContent
    const h1 = screen.getByRole("heading", { level: 1 });
    const text = h1.textContent?.replace(/\u00A0/g, " ") ?? "";
    expect(text).toContain("Stop guessing.");
    expect(text).toContain("Start passing.");
    expect(screen.getByRole("link", { name: /Start for free/i })).toHaveAttribute("href", "/login?register=true");
    expect(screen.getByRole("link", { name: /See how it works/i })).toHaveAttribute("href", "#signal");
  });

  it("HeroVisual renders static fallback without throwing (reduced motion)", () => {
    const { container } = render(<HeroVisual />);
    // In reduced motion, static fallback SVG is rendered
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("KnowledgeField renders GalaxyFallback when quality is static", () => {
    const { container } = render(<KnowledgeField quality="static" isDark={true} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 800 500");
  });

  it("GalaxyFallback respects isDark prop", () => {
    const { container: dark } = render(<KnowledgeField quality="static" isDark={true} />);
    const { container: light } = render(<KnowledgeField quality="static" isDark={false} />);
    const darkBg = dark.querySelector("div")?.style.background;
    const lightBg = light.querySelector("div")?.style.background;
    expect(darkBg).not.toBe(lightBg);
  });
});