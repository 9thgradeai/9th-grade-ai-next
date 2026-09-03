"use client";

// 9th-Grade AI assistant logo — a modern, premium mark for the AI workspace.
// A soft emerald→cyan gradient tile holding a chat bubble with a rising
// spark. The spark doubles as the product's "growth / level-up" idea and the
// bubble reads unmistakably as a chatbot.
//
// Two tones:
//  - solid (default): gradient tile + white bubble + gradient spark — used as
//    the launcher, the header mark and the sidebar/bottom-nav AI chip.
//  - soft: monochrome glyph in `currentColor` with a white spark — used inside
//    tinted avatar boxes so it inherits the surrounding accent colour.

import { useId } from "react";

export type AiLogoProps = {
  className?: string;
  /** Accepted for compatibility with the lucide icon map; unused by the SVG. */
  strokeWidth?: number;
  /** When false, renders the bare glyph in `currentColor` (no tile). */
  solid?: boolean;
};

const SPARK = "M12 8.7l.95 2.2 2.2.95-2.2.95-.95 2.2-.95-2.2-2.2-.95 2.2-.95z";

const BUBBLE =
  "M12 3.4c-5 0-9 3.4-9 7.6 0 2.3 1.2 4.4 3 5.7l-.9 3.2c-.2.7.5 1.2 1.1.9l3.5-2.1c.8.1 1.6.2 2.3.2 5 0 9-3.4 9-7.9S17 3.4 12 3.4z";

export default function AiLogo({ className, solid = true }: AiLogoProps) {
  const gid = `ailogo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--success)" />
          <stop offset="55%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--info)" />
        </linearGradient>
      </defs>
      {solid && (
        <rect x="0.6" y="0.6" width="22.8" height="22.8" rx="6.5" fill={`url(#${gid}-g)`} />
      )}
      <path d={BUBBLE} fill={solid ? "#ffffff" : "currentColor"} />
      <path d={SPARK} fill={solid ? `url(#${gid}-g)` : "#ffffff"} />
    </svg>
  );
}