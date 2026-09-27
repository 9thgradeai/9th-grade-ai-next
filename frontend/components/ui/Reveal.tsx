"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

// Below-fold fade-up reveal driven by IntersectionObserver + CSS — no motion
// runtime. Same props/API as the previous framer-motion version so the five
// landing sections using it need no changes. Respects the global
// prefers-reduced-motion kill-switch in globals.css (transitions collapse to
// 0.01ms) and renders content visible when IO is unavailable (SSR/test).

export default function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style = { "--reveal-delay": `${delay}s` } as CSSProperties;

  return (
    <Tag
      // ref callback keeps the polymorphic Tag typing simple across targets.
      ref={ref as never}
      style={style}
      className={`reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </Tag>
  );
}
