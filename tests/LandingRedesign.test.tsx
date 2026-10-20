import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScrollTypeSection from "@/components/landing/ScrollTypeSection";
import Icon3D from "@/components/landing/icons/Icon3D";
import Footer from "@/components/Footer";
import { LanguageContext } from "@/lib/lang-ctx";
import { en, bn } from "@/lib/i18n/dictionary";

/**
 * Landing redesign 2026: Scroll Type band, 3D icon set, retro badges,
 * premium footer. These tests pin the progressive-enhancement contract —
 * kinetic type and stickers are decorative, content is never hidden, and
 * every new string has an EN + BN value.
 */

describe("ScrollTypeSection", () => {
  it("renders all four kinetic lines and the loop note", () => {
    render(<ScrollTypeSection />);
    for (const line of ["Practice.", "Analyze.", "Adapt.", "Repeat."]) {
      // ghost + fill layer both carry the word (fill is the animated overlay)
      expect(screen.getAllByText(line).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText(/Every session feeds the next/i)).toBeInTheDocument();
  });

  it("exposes an accessible heading and marks decorative layers hidden", () => {
    const { container } = render(<ScrollTypeSection />);
    expect(
      screen.getByRole("heading", { name: /preparation loop/i }),
    ).toBeInTheDocument();
    const fills = container.querySelectorAll(".scroll-type-fill");
    expect(fills.length).toBe(4);
    fills.forEach((el) => expect(el).toHaveAttribute("aria-hidden", "true"));
  });

  it("staggers each line with a data attribute for the scroll range offsets", () => {
    const { container } = render(<ScrollTypeSection />);
    expect(container.querySelectorAll('[data-stagger="3"]').length).toBe(1);
  });
});

describe("Icon3D", () => {
  it("renders decorative icons hidden from assistive tech by default", () => {
    const { container } = render(<Icon3D name="scatter" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 48 48");
  });

  it("exposes a title as an image when provided", () => {
    render(<Icon3D name="clock" title="Scattered resources" />);
    expect(screen.getByRole("img", { name: "Scattered resources" })).toBeInTheDocument();
  });

  it("renders every icon in the set", () => {
    for (const name of ["scatter", "calendar", "clock", "target"] as const) {
      const { container, unmount } = render(<Icon3D name={name} />);
      expect(container.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });
});

describe("Footer (premium)", () => {
  it("keeps the brand, legal links, and conversion CTA", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(
      screen.getByRole("link", { name: "Start for free" }),
    ).toHaveAttribute("href", "/register");
  });

  it("renders curated link columns and the giant wordmark", () => {
    const { container } = render(<Footer />);
    expect(screen.getByRole("navigation", { name: "Footer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exam tracks" })).toHaveAttribute("href", "/tracks");
    expect(screen.getByRole("link", { name: "Careers" })).toHaveAttribute("href", "/careers");
    const wordmark = container.querySelector(".footer-wordmark");
    expect(wordmark).toHaveTextContent("9Th-Grade AI");
    expect(wordmark?.parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("offers a back-to-top control and the language toggle", () => {
    render(<Footer />);
    expect(screen.getByRole("button", { name: /back to top/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /বাং|EN/ })).toBeInTheDocument();
  });
});

describe("i18n dictionary parity", () => {
  it("keeps EN and BN key sets identical", () => {
    const enKeys = Object.keys(en).sort();
    const bnKeys = Object.keys(bn).sort();
    expect(bnKeys).toEqual(enKeys);
  });

  it("has non-empty bilingual values for every redesign key", () => {
    const redesignKeys = [
      "scrollType.kicker",
      "scrollType.srTitle",
      "scrollType.l1",
      "scrollType.l2",
      "scrollType.l3",
      "scrollType.l4",
      "scrollType.note",
      "hero.stickerTop",
      "hero.stickerBottom",
      "finalCta.badgeTop",
      "finalCta.badgeBottom",
      "footer.start",
      "footer.backToTop",
      "footer.pill",
      "footer.columnsLabel",
      "footer.column.platform",
      "footer.column.organization",
      "footer.column.legal",
      "footer.link.tracks",
      "footer.link.currentAffairs",
      "footer.link.guides",
      "footer.link.vocab",
      "footer.link.blog",
      "footer.link.docs",
      "footer.link.about",
      "footer.link.careers",
      "footer.link.press",
      "footer.link.partners",
    ];
    for (const key of redesignKeys) {
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(bn[key], `bn missing ${key}`).toBeTruthy();
      expect(en[key]).not.toBe(key);
      expect(bn[key]).not.toBe(key);
    }
  });
});

describe("Bengali rendering", () => {
  it("renders the scroll-type band in Bengali via context", () => {
    render(
      <LanguageContext.Provider value={{ lang: "bn", setLang: () => {}, toggleLang: () => {} }}>
        <ScrollTypeSection />
      </LanguageContext.Provider>,
    );
    expect(screen.getAllByText("অনুশীলন।").length).toBeGreaterThanOrEqual(1);
  });
});
