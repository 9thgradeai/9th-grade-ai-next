import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { statSync } from "fs";
import { join } from "path";
import WorldMapBackdrop from "@/components/dashboard/WorldMapBackdrop";
import { WORLD_MAP_PATH, WORLD_MAP_VIEWBOX, DHAKA_SPOT } from "@/lib/data/world-map";

vi.mock("@/lib/ecosystem-ctx", () => ({
  useEcosystem: () => ({ ecosystem: "BCS" }),
}));

vi.mock("@/lib/services/api", () => ({
  api: { preparationIntelligence: vi.fn().mockResolvedValue(null) },
}));

describe("world-map asset contract", () => {
  it("stays under the 25KB budget", () => {
    const bytes = statSync(join(process.cwd(), "frontend", "lib", "data", "world-map.ts")).size;
    expect(bytes).toBeLessThan(25 * 1024);
  });

  it("exports a valid viewBox, non-empty path and in-range Dhaka spot", () => {
    expect(WORLD_MAP_VIEWBOX).toBe("0 0 1000 500");
    expect(WORLD_MAP_PATH.length).toBeGreaterThan(1000);
    expect(WORLD_MAP_PATH).toMatch(/^M/);
    expect(DHAKA_SPOT.x).toBeGreaterThan(740);
    expect(DHAKA_SPOT.x).toBeLessThan(765);
    expect(DHAKA_SPOT.y).toBeGreaterThan(170);
    expect(DHAKA_SPOT.y).toBeLessThan(195);
  });
});

describe("WorldMapBackdrop", () => {
  it("renders hidden-from-AT, non-interactive, desktop-only", () => {
    const { container } = render(<WorldMapBackdrop />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("lg:block");
    expect(root.querySelector("svg")).not.toBeNull();
  });

  it("defaults the spotlight to Bangladesh", async () => {
    render(<WorldMapBackdrop />);
    await waitFor(() => {
      expect(screen.getByText("Bangladesh")).toBeInTheDocument();
    });
  });
});
