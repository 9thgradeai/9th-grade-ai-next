import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NextBestAction from "@/components/dashboard/NextBestAction";

// The hero CTA must drive navigation via the dashboard store — not fabricate a
// route. We stub the store action and assert the correct tab is requested.
const setActiveTab = vi.fn();

vi.mock("@/lib/store-ctx/dashboard", () => ({
  useDashboardStore: () => ({ setActiveTab }),
}));

describe("NextBestAction", () => {
  it("renders the recommended title and routes to the right tab on click", () => {
    render(
      <NextBestAction
        action={{
          id: "review-mistakes",
          title: "৩টি ভুল পর্যালোচনা করুন",
          description: "ভুলগুলো বুঝে নিন।",
          cta: "ভুলের নোট দেখুন",
          tab: "wrong-answers",
          intensity: "medium",
        }}
      />,
    );

    expect(screen.getByText("৩টি ভুল পর্যালোচনা করুন")).toBeTruthy();
    expect(screen.getByText("ভুলের নোট দেখুন")).toBeTruthy();

    fireEvent.click(screen.getByText("ভুলের নোট দেখুন"));
    expect(setActiveTab).toHaveBeenCalledWith("wrong-answers");
  });
});
