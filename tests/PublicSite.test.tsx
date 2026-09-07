import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";
import TerminalHeader from "@/components/TerminalHeader";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";

vi.mock("@/lib/auth-ctx", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    useAuth: () => ({ user: null, isLoading: false, logout: vi.fn() }),
  };
});

const VALID_INTERNAL_PREFIXES = [
  "/",
  "/login",
  "/dashboard",
  "/tracks",
  "/archive",
  "/blog",
  "/guides",
  "/current-affairs",
  "/vocab",
  "/docs",
  "/about",
  "/careers",
  "/press",
  "/partners",
  "/privacy",
  "/terms",
];

function isInternal(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

describe("Footer", () => {
  it("renders minimal footer with brand and legal links", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    // Minimal footer exposes only essential legal/navigation links
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github.getAttribute("href")).toMatch(/github\.com/);
  });

  it("points every internal link at a valid route", () => {
    render(<Footer />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href));

    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      if (!isInternal(href)) continue;
      const path = href.split(/[?#]/)[0];
      const resolves = VALID_INTERNAL_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      );
      expect(resolves, `Footer link "${href}" does not resolve to a known route`).toBe(true);
    }
  });

  it("no longer ships the dead #tracks or /dashboard?tab=archive links", () => {
    render(<Footer />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("#tracks");
    expect(hrefs).not.toContain("/dashboard?tab=archive");
  });

  it("keeps full navigation in AppNavbar mega menus (not duplicated in footer)", () => {
    render(<Footer />);
    // Footer is intentionally minimal; deep navigation lives in AppNavbar
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    // Should not contain deep nav like /tracks# or /blog from legacy footer columns
    expect(hrefs.filter((h) => h?.startsWith("/tracks#")).length).toBe(0);
  });
});

describe("TerminalHeader", () => {
  it("links Tracks to the /tracks page instead of a dead anchor", () => {
    render(<TerminalHeader />);
    expect(screen.getByRole("link", { name: "Tracks" })).toHaveAttribute("href", "/tracks");
  });

  it("links Features and Syllabus to landing page anchors", () => {
    render(<TerminalHeader />);
    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "/#features");
    expect(screen.getByRole("link", { name: "Syllabus" })).toHaveAttribute("href", "/#syllabus");
  });
});

describe("PublicShell", () => {
  it("renders the shared header and footer around page content", () => {
    render(
      <PublicShell>
        <p>page body</p>
      </PublicShell>,
    );
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

describe("PageHero", () => {
  it("renders eyebrow, title, and action links", () => {
    render(
      <PageHero
        eyebrow="EXAM TRACKS"
        title="Structured Tracks"
        highlight="For Every Exam"
        description="A description."
        actions={[{ href: "/login", label: "Start Free" }]}
      />,
    );
    expect(screen.getByText("EXAM TRACKS")).toBeInTheDocument();
    expect(screen.getByText("Structured Tracks")).toBeInTheDocument();
    expect(screen.getByText("For Every Exam")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Free" })).toHaveAttribute("href", "/login");
  });
});