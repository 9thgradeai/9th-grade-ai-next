import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuroraRing, BootProgress } from "@/components/ui/Loader";
import { LoadingShell } from "@/components/ui/LoadingShell";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    { get: () => (props: Record<string, unknown>) => <div {...props} /> },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

describe("AuroraRing", () => {
  it("announces its label to screen readers", () => {
    render(<AuroraRing label="Syncing" />);
    expect(screen.getByRole("status", { name: "Syncing" })).toBeTruthy();
    // The decorative brand glyph sits centre-stage in the ring.
    expect(screen.getByText("9G")).toBeTruthy();
  });
});

describe("BootProgress", () => {
  it("renders an indeterminate progress bar with segments", () => {
    render(<BootProgress label="boot" segments={8} />);
    expect(screen.getByRole("progressbar", { name: "boot" })).toBeTruthy();
    expect(document.querySelectorAll(".boot-seg").length).toBe(8);
  });
});

describe("LoadingShell", () => {
  it("renders title, 9G mark and progress bar", () => {
    render(<LoadingShell title="LOADING_TEST" />);
    expect(screen.getByText("LOADING_TEST")).toBeTruthy();
    expect(screen.getByText("9G")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "loading" })).toBeTruthy();
    // No terminal step list.
    expect(document.querySelector("[class*='LOADING_TERMINAL']")).toBeNull();
  });
});
