import { describe, it, expect } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { useMotionTier, useFirstMountAnimate } from "@/lib/motion/use-motion-tier";

describe("useMotionTier", () => {
  it("reports full motion on a capable device without reduced-motion", () => {
    const { result } = renderHook(() => useMotionTier());
    // jsdom: mid tier, no reduced-motion → full choreography allowed.
    expect(result.current.fullMotion).toBe(true);
    expect(result.current.reducedMotion).toBe(false);
  });
});

describe("useFirstMountAnimate", () => {
  function Probe({ enabled, seen }: { enabled: boolean; seen: boolean[] }) {
    seen.push(useFirstMountAnimate(enabled));
    return null;
  }

  it("fires on the first committed render, then stays quiet", () => {
    const seen: boolean[] = [];
    const { rerender } = render(<Probe enabled seen={seen} />);
    expect(seen).toEqual([true, false]);
    rerender(<Probe enabled seen={seen} />);
    rerender(<Probe enabled seen={seen} />);
    // Re-renders only ever observe the settled state — never a re-fire.
    expect(seen).toEqual([true, false, false, false]);
  });

  it("never fires while disabled", () => {
    const seen: boolean[] = [];
    const { rerender } = render(<Probe enabled={false} seen={seen} />);
    expect(seen).toEqual([false]);
    rerender(<Probe enabled={false} seen={seen} />);
    expect(seen).toEqual([false, false]);
  });
});
