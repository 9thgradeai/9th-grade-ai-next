"use client";

import type { ReactNode } from "react";

interface DoubleBezelCardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  glow?: boolean;
  as?: "div" | "section" | "article";
}

/**
 * Double-Bezel (Doppelrand) nested card architecture per high-end-visual-design §4.A.
 *
 * Outer shell: subtle background, hairline border, padding, large radius.
 * Inner core: distinct background, inner highlight, calculated smaller radius.
 * Creates the impression of physical machined hardware (glass plate in tray).
 */
export default function DoubleBezelCard({
  children,
  className = "",
  interactive = false,
  glow = false,
  as: Tag = "div",
}: DoubleBezelCardProps) {
  const interactiveClass = interactive
    ? "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[2px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
    : "";

  const glowClass = glow
    ? "bg-[radial-gradient(120%_90%_at_100%_0%,rgba(129,140,248,0.08)_0%,transparent_55%),var(--surface-raised)]"
    : "bg-[var(--surface-raised)]";

  return (
    <Tag
      className={`relative overflow-hidden rounded-[2rem] p-1.5 ring-1 ring-white/[0.06] ${interactiveClass} ${className}`}
    >
      <div
        className={`relative rounded-[calc(2rem-0.375rem)] p-5 ${glowClass} shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${
          interactive ? "cursor-pointer" : ""
        }`}
      >
        {children}
      </div>
    </Tag>
  );
}
