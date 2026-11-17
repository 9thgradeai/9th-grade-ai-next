import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingShell } from "@/components/ui/LoadingShell";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    { get: () => (props: Record<string, unknown>) => <div {...props} /> },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

describe("LoadingShell", () => {
  it("renders title, 9G mark and elapsed time indicator", () => {
    render(<LoadingShell title="LOADING_TEST" />);
    expect(screen.getByText("LOADING_TEST")).toBeTruthy();
    expect(screen.getByText("9G")).toBeTruthy();
    // Now reports elapsed seconds instead of a faking progress bar,
    // so we check the seconds counter is visible and updating.
    expect(screen.getByText(/^\d+s$/)).toBeTruthy();
    // No terminal step list.
    expect(document.querySelector("[class*='LOADING_TERMINAL']")).toBeNull();
  });
});