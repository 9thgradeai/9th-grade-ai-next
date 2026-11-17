import { describe, it, expect, vi, fireEvent } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeTab from "../../../../app/dashboard/home/page";

// Mock the dashboard store before importing HomeTab so the component
// receives a stable store with setActiveTab that records calls.
vi.mock("@/lib/store-ctx/dashboard", async () => {
  const mod = await import("@/lib/store-ctx/dashboard");
  return {
    ...mod,
    useDashboardStore: () => ({
      activeTab: "home",
      setActiveTab: vi.fn(),
    }),
  };
});

describe("HomeTab", () => {
  it("preserves the relocated mission action", async () => {
    const { components } = render(<HomeTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Start warm-up/ }));
    // Mission CTA carries the rec id so completion can be attributed (REC_COMPLETED).
    // Intent is now set atomically with the tab switch via setActiveTab opts.
    expect(components.setActiveTab).toHaveBeenCalledWith("practice", {
      practiceIntent: { mode: "quick", subject: undefined, recId: "daily-warmup" },
    });
  });

  it("fires plan task toggle through to api", async () => {
    render(<HomeTab />);
    const toggle = await screen.findByRole("button", { name: /Mark complete/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(components.toggleStudyTask).toHaveBeenCalledWith(1);
    });
  });
});