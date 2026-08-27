"use client";

import { useEffect, useRef } from "react";

/**
 * Thin scroll-progress bar for the top of the page. Uses a passive scroll
 * listener + rAF (no animation library) so it stays out of the initial JS
 * bundle and never blocks first paint. Reduced-motion users see nothing.
 */
export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? Math.min(1, doc.scrollTop / max) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2px] z-[80] origin-left bg-gradient-to-r from-emerald-500 via-cyan-400 to-indigo-500"
      style={{ transform: "scaleX(0)" }}
    />
  );
}
