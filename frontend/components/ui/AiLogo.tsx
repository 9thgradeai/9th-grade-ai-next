"use client";

// 9Th-Grade AI assistant logo — "The Ninth Signal" (নব-তারা / Navotara).
//
// A bespoke mark drawn from the product's own identity instead of a generic
// bot / brain / bubble / sparkle:
//   · An open orbit ring — the loop of a "9", standing for the 9Th-Grade
//     brand and the 9th-pay-scale government posts the product serves.
//   · An Aurora Iris spark nested inside the loop — the AI core that lights
//     the knowledge orbit (teal → cyan → iris → magenta).
//   · A tapering signal beam dropping from the loop — the "9"'s stem, drawn
//     as a shooting streak that guides aspirants up the career ladder.
//   · A distant constellation node + spoke — kin to the BrandMark's knowledge
//     cosmos, so the AI emblem and the product mark read as one family.
//
// Two tones:
//  - solid (default): deep-space tile + white glyph + gradient spark — used
//    as the launcher, the header mark and the navbar/bottom-nav AI chip. The
//    dark tile mirrors BrandMark so both sit together without clashing.
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

// Aurora Iris spectrum — the product's fixed brand gradient (DESIGN-SYSTEM.md).
const AURORA_IRIS = [
  { offset: "0%", color: "#14b8a6" },
  { offset: "40%", color: "#22d3ee" },
  { offset: "75%", color: "#818cf8" },
  { offset: "100%", color: "#e879f9" },
] as const;

// Open orbit ring = the loop ball of a "9", gap broken on the left where a
// handwritten nine begins. The stem below exits the lower-right, so the whole
// glyph reads as a numeral 9 — the 9Th-Grade pay scale the product serves.
const RING = "M7.28 12.23 A4.1 4.1 0 1 0 7.28 8.77";

// Tapered signal beam — the "9" stem drawn as a falling shooting streak that
// guides aspirants down to the answer line.
const TAIL = "M14.4 12.6 C15.1 15 14.9 17.6 13.5 19.9 C12.9 17.2 12.6 14.7 12.4 12.9 Z";

// 4-point AI spark. Repositioned via transform so the same shape stays crisp
// at every scale; verified by tests as the gradient-filled core.
const SPARK = "M12 8.7l.95 2.2 2.2.95-2.2.95-.95 2.2-.95-2.2-2.2-.95 2.2-.95z";

// Constellation spoke + node — one knowledge point bound to the orbit, kin to
// BrandMark's cosmology, so the AI emblem and product mark share a family.
const SPOKE = "M14 6.3 L17.1 6.5";

export default function AiLogo({ className, solid = true }: AiLogoProps) {
  const gid = `ailogo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const glyph = solid ? "#ffffff" : "currentColor";

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
          {AURORA_IRIS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <linearGradient id={`${gid}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a0e1a" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>

      {solid && (
        <rect x="0.6" y="0.6" width="22.8" height="22.8" rx="6.5" fill={`url(#${gid}-tile)`} />
      )}
      {solid && (
        <rect x="0.6" y="0.6" width="22.8" height="22.8" rx="6.5" fill="none" stroke={`url(#${gid}-g)`} strokeOpacity="0.35" strokeWidth="0.9" />
      )}

      {/* signal beam — behind the ring so the junction reads as connected */}
      <path d={TAIL} fill={solid ? `url(#${gid}-g)` : "currentColor"} opacity={solid ? 0.95 : 0.9} />
      {/* orbit ring — the loop ball of the "9" */}
      <path
        d={RING}
        fill="none"
        stroke={glyph}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* AI spark nested in the loop */}
      <path
        d={SPARK}
        transform="translate(11.2 9.4) scale(0.58) translate(-12 -11.85)"
        fill={solid ? `url(#${gid}-g)` : "#ffffff"}
      />
      {/* distant constellation node */}
      <circle
        cx="17.1"
        cy="6.2"
        r="1.05"
        fill={solid ? `url(#${gid}-g)` : "#ffffff"}
      />
      {/* spoke to the node */}
      <path d={SPOKE} stroke={glyph} strokeOpacity="0.5" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  );
}