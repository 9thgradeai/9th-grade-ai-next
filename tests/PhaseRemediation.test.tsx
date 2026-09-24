import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { NAV_GROUPS, BOTTOM_TAB_IDS, TABS } from "@/lib/data";
import { invalidateCache } from "@/lib/services/api";
import ThemeToggle from "@/components/ThemeToggle";
import { render } from "@testing-library/react";

describe("Phase 1 — single nav source", () => {
  it("NAV_GROUPS covers every tab exactly once", () => {
    const ids = NAV_GROUPS.flatMap((g) => g.ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...TABS.map((t) => t.id)].sort());
  });
  it("BOTTOM_TAB_IDS is a subset of TABS", () => {
    for (const id of BOTTOM_TAB_IDS) {
      expect(TABS.some((t) => t.id === id)).toBe(true);
    }
  });
});

describe("Phase 4 — api cache invalidation", () => {
  it("exposes invalidateCache", () => {
    expect(typeof invalidateCache).toBe("function");
    expect(() => invalidateCache()).not.toThrow();
  });
});

describe("Phase 2 — dead ThemeToggle removed", () => {
  it("renders nothing (dashboard toggle is the single truth)", () => {
    const { container } = render(<ThemeToggle />);
    expect(container.innerHTML).toBe("");
  });
});
