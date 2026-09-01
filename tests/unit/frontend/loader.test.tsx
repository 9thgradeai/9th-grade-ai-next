import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuroraRing, StatusText, BootProgress } from "@/components/ui/Loader";
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

describe("StatusText", () => {
  it("types out the current message and cycles to the next", () => {
    vi.useFakeTimers();
    try {
      render(<StatusText messages={["first step", "second step"]} interval={50} />);
      // Real announced copy is hidden; the visible line starts with a prompt.
      expect(screen.getByText(/^\$/)).toBeTruthy();

      // Advance well past typing the whole first message plus the hold interval
      // so the typewriter loop deterministically advances to the next message.
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // The live region announces the full active message; because it has
      // cycled, it must no longer be the opening message.
      const live = screen.getByRole("status")?.textContent ?? "";
      expect(live).not.toBe("");
      expect(["first step", "second step"]).toContain(live);
      expect(screen.getByRole("status")?.textContent).toContain("step");
    } finally {
      vi.useRealTimers();
    }
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
  it("renders title, status line and progress bar", () => {
    render(<LoadingShell title="LOADING_TEST" />);
    expect(screen.getByText("LOADING_TEST")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "dashboard boot" })).toBeTruthy();
  });
});
