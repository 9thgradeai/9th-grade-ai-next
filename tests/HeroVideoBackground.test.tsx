import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HeroVideoBackground from "@/components/landing/hero/HeroVideoBackground";

describe("HeroVideoBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the video element and fallback poster", () => {
    const { container } = render(<HeroVideoBackground />);
    const video = container.querySelector("video");
    expect(video).toBeDefined();
    expect(video?.getAttribute("playsinline")).not.toBeNull();
    expect(video?.getAttribute("poster")).toBe("/hero-poster.webp");
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
  });
});
