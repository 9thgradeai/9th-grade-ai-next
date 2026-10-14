import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TopicBars from "@/components/dashboard/practice/TopicBars";

describe("TopicBars", () => {
  it("aggregates by subject › topic worst-first", () => {
    render(
      <TopicBars
        items={[
          { subject: "গণিত", topic: "বীজগণিত", status: "wrong" },
          { subject: "গণিত", topic: "বীজগণিত", status: "wrong" },
          { subject: "বাংলা", topic: "ব্যাকরণ", status: "correct" },
        ]}
      />,
    );
    expect(screen.getByText(/টপিকভিত্তিক/)).toBeDefined();
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBe(2);
    // Worst-first: গণিত › বীজগণিত (0%) before বাংলা (100%)
    expect(bars[0].getAttribute("aria-label")).toContain("গণিত");
  });

  it("renders nothing for empty items", () => {
    const { container } = render(<TopicBars items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
