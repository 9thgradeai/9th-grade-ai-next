"use client";

import { useState } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowUp } from "lucide-react";

/**
 * Site-wide back-to-top affordance for public pages.
 *
 * Appears only after the reader has scrolled past the first viewport-height
 * of content. The threshold crossing is derived from Framer's scroll Motion
 * value (no scroll listener, no per-frame state churn — React bails out on
 * identical values). Reduced-motion users get an instant jump instead of a
 * smooth scroll.
 */
export default function BackToTop() {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setVisible(latest > window.innerHeight * 0.9);
  });

  const scrollToTop = () => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#0b0d1d]/80 text-zinc-300 shadow-panel backdrop-blur-md transition-[opacity,transform,border-color,color] duration-300 hover:border-emerald-400/50 hover:text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
