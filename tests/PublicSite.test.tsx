import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Footer from "@/components/Footer";
import TerminalHeader from "@/components/TerminalHeader";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";

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
  it("renders all four link columns", () => {
    render(<Footer />);
    expect(screen.getByRole("navigation", { name: "Product links" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Exam tracks" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Company" })).toBeInTheDocument();
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

  it("wires every exam-track link to the /tracks page", () => {
    render(<Footer />);
    const tracksNav = screen.getByRole("navigation", { name: "Exam tracks" });
    const hrefs = within(tracksNav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    hrefs.forEach((href) => {
      expect(href, `Track link "${href}" should target /tracks`).toMatch(/^\/tracks#/);
    });
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
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
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