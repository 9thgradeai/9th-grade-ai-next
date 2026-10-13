import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OfflineBanner from "@/components/pwa/OfflineBanner";
import { SkeletonCard, SkeletonTable, SkeletonDeck } from "@/components/ui/Skeleton";

describe("offline banner", () => {
  it("renders nothing when online (SSR defaults to online)", () => {
    const html = renderToStaticMarkup(<OfflineBanner />);
    expect(html).toBe("");
  });
});

describe("skeleton placeholders", () => {
  it("exposes status role for assistive tech", () => {
    for (const el of [
      <SkeletonCard key="c" />,
      <SkeletonTable key="t" rows={2} />,
      <SkeletonDeck key="d" tiles={2} />,
    ]) {
      const html = renderToStaticMarkup(el);
      expect(html).toContain('role="status"');
    }
  });
});
