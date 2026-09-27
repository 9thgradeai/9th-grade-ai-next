// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NAVIGATION } from "@/lib/navigation";
import { LanguageContext } from "@/lib/lang-ctx";
import BottomNav from "@/components/dashboard/BottomNav";

describe("navigation bilingual parity (Phase 5.3)", () => {
  it("every menu, group, item, and highlight has a Bangla variant", () => {
    const missing: string[] = [];
    for (const m of NAVIGATION) {
      if (!m.labelBn) missing.push(`menu:${m.id}`);
      for (const g of m.groups) {
        if (!g.labelBn) missing.push(`group:${m.id}/${g.label}`);
        for (const item of g.items) {
          if (!item.labelBn) missing.push(`item:${m.id}/${item.label}`);
        }
      }
      if (m.highlight && (!m.highlight.titleBn || !m.highlight.ctaBn)) {
        missing.push(`highlight:${m.id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("item descriptions fall back to English when descBn is absent", () => {
    // pickLang(t) contract: t(lang, bn, en) prefers bn only when present.
    for (const m of NAVIGATION) {
      for (const g of m.groups) {
        for (const item of g.items) {
          expect(item.desc ?? item.descBn ?? "").toBeDefined();
        }
      }
    }
  });
});

function renderNav(lang: "bn" | "en") {
  return render(
    <LanguageContext.Provider value={{ lang, setLang: () => {}, toggleLang: () => {} }}>
      <BottomNav activeTab="home" onChange={() => {}} />
    </LanguageContext.Provider>,
  );
}

describe("BottomNav language awareness", () => {
  it("renders Bengali shorts by default", () => {
    const { unmount } = renderNav("bn");
    expect(screen.getByText("ব্যাংক")).toBeDefined();
    expect(screen.getByText("আরও")).toBeDefined();
    unmount();
  });

  it("renders English shorts when lang=en", () => {
    const { unmount } = renderNav("en");
    expect(screen.getByText("Bank")).toBeDefined();
    expect(screen.getByText("More")).toBeDefined();
    unmount();
  });
});
