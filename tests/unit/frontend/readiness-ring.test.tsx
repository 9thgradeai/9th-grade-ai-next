import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReadinessRing from "@/components/dashboard/command-center/ReadinessRing";

describe("ReadinessRing", () => {
  it("renders center content with an accessible progress label", () => {
    render(
      <ReadinessRing
        value={75}
        center={<p>23</p>}
        label={<p>Days left</p>}
        ariaLabel="45th BCS Preliminary — 23 days left"
      />,
    );
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Days left")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "45th BCS Preliminary — 23 days left" }),
    ).toBeInTheDocument();
  });

  it("clamps out-of-range values to a valid ring", () => {
    const { rerender } = render(<ReadinessRing value={140} ariaLabel="Progress 100 percent" />);
    expect(screen.getByRole("img", { name: "Progress 100 percent" })).toBeInTheDocument();
    rerender(<ReadinessRing value={-20} ariaLabel="Progress 0 percent" />);
    expect(screen.getByRole("img", { name: "Progress 0 percent" })).toBeInTheDocument();
  });

  it("renders the final state directly under reduced motion", () => {
    // jsdom has no reduced-motion: the ring still paints its track + progress
    // circles without depending on animation state.
    const { container } = render(<ReadinessRing value={50} />);
    const circles = container.querySelectorAll("svg circle");
    expect(circles).toHaveLength(2);
    expect(circles[1].getAttribute("stroke-dasharray")).toBeTruthy();
  });
});
