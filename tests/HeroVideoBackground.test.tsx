import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HeroVideoBackground from "@/components/landing/hero/HeroVideoBackground";

describe("HeroVideoBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the video element with immediate playback attributes", () => {
    const { container } = render(<HeroVideoBackground />);
    const video = container.querySelector("video");
    expect(video).toBeDefined();
    expect(video?.getAttribute("playsinline")).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.autoplay).toBe(true);
  });
});

