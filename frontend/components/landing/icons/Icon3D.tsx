"use client";

import { useId } from "react";

/**
 * Pure-SVG 3D icon set for the marketing surfaces. Each icon is built from
 * four depth cues — a soft ground shadow, a darker extrusion layer offset
 * behind the face, a gradient face, and a specular highlight — so the icons
 * read as rendered objects without shipping any image or 3D runtime.
 *
 * Zero JS beyond render: no canvas, no WebGL, no animation library. Hover
 * float/shadow catch lives on the parent `.icon-3d-tile` (globals.css).
 */

export type Icon3DName = "scatter" | "calendar" | "clock" | "target";

const GROUND_SHADOW = <ellipse cx="24" cy="43.2" rx="12.5" ry="2.4" fill="#000" opacity="0.35" />;

export default function Icon3D({
  name,
  className = "",
  title,
}: {
  name: Icon3DName;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const face = `i3d-face-${uid}`;
  const edge = `i3d-edge-${uid}`;

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      fill="none"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {/* Face gradient: brand teal → cyan, lit from top-left */}
        <linearGradient id={face} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="55%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        {/* Extrusion gradient: the unlit sides of the object */}
        <linearGradient id={edge} x1="10" y1="10" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#155E6B" />
          <stop offset="100%" stopColor="#1E1B4B" />
        </linearGradient>
      </defs>

      {name === "scatter" && (
        <g>
          {GROUND_SHADOW}
          {/* back card, rotated away */}
          <g transform="rotate(-16 20 26)">
            <rect x="9" y="14" width="16" height="21" rx="3" fill={`url(#${edge})`} />
          </g>
          {/* mid card, rotated the other way */}
          <g transform="rotate(12 30 25)">
            <rect x="22" y="12" width="16" height="21" rx="3" fill={`url(#${edge})`} opacity="0.85" />
          </g>
          {/* front card: gradient face + ruled content */}
          <g transform="rotate(-3 24 24)">
            <rect x="13" y="9" width="19" height="25" rx="3.5" fill={`url(#${face})`} />
            <rect x="13" y="9" width="19" height="25" rx="3.5" fill="#fff" opacity="0.14" />
            <g stroke="#04110D" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round">
              <path d="M17 16h11" />
              <path d="M17 20.5h11" />
              <path d="M17 25h7" />
            </g>
            {/* specular edge */}
            <path d="M15 11.5c.6-.9 1.6-1.5 2.8-1.7" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </g>
      )}

      {name === "calendar" && (
        <g>
          {GROUND_SHADOW}
          {/* extrusion slab behind */}
          <rect x="8" y="11" width="32" height="30" rx="5" fill={`url(#${edge})`} />
          {/* binding rings */}
          <g stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round">
            <path d="M16 7.5v6" />
            <path d="M32 7.5v6" />
          </g>
          {/* face */}
          <rect x="8" y="9" width="32" height="30" rx="5" fill={`url(#${face})`} />
          <rect x="8" y="9" width="32" height="8" rx="5" fill="#04110D" opacity="0.28" />
          <rect x="8" y="14" width="32" height="3" fill="#04110D" opacity="0.28" />
          {/* identical rows for everyone: the generic-plan message */}
          <g fill="#04110D" fillOpacity="0.6">
            <circle cx="15" cy="23.5" r="2" />
            <circle cx="24" cy="23.5" r="2" />
            <circle cx="33" cy="23.5" r="2" />
            <circle cx="15" cy="31.5" r="2" />
            <circle cx="24" cy="31.5" r="2" />
            <circle cx="33" cy="31.5" r="2" />
          </g>
          <path d="M11 12c.7-1 1.8-1.6 3.1-1.7" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}

      {name === "clock" && (
        <g>
          {GROUND_SHADOW}
          {/* alarm bells + legs, extrusion tone */}
          <g fill={`url(#${edge})`}>
            <path d="M12.5 10.5c-2.6 1.4-4.3 3.6-4.9 6.2l4.6 2.4 2.4-7.4-2.1-1.2Z" />
            <path d="M35.5 10.5c2.6 1.4 4.3 3.6 4.9 6.2l-4.6 2.4-2.4-7.4 2.1-1.2Z" />
            <rect x="12" y="37" width="4.6" height="5" rx="2" transform="rotate(18 14 39)" />
            <rect x="31.4" y="37" width="4.6" height="5" rx="2" transform="rotate(-18 34 39)" />
          </g>
          {/* extrusion body */}
          <circle cx="25" cy="25" r="14.5" fill={`url(#${edge})`} />
          {/* face */}
          <circle cx="24" cy="24" r="14.5" fill={`url(#${face})`} />
          <circle cx="24" cy="24" r="10.8" fill="#04110D" opacity="0.28" />
          {/* hands: feedback that arrives after the moment has passed */}
          <g stroke="#E9FBF6" strokeWidth="2.4" strokeLinecap="round">
            <path d="M24 17v7.5l5 3.5" />
          </g>
          <circle cx="24" cy="24" r="1.7" fill="#E9FBF6" />
          {/* late-arrival alert pip */}
          <circle cx="36.5" cy="11.5" r="4.6" fill="#FBBF24" />
          <path d="M36.5 9.4v2.6" stroke="#04110D" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="36.5" cy="13.7" r="0.9" fill="#04110D" />
          <path d="M16 15.5c1.2-2.2 3.2-3.8 5.6-4.6" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.7" strokeLinecap="round" />
        </g>
      )}

      {name === "target" && (
        <g>
          {GROUND_SHADOW}
          {/* extrusion ring */}
          <circle cx="25.2" cy="25" r="14.6" fill={`url(#${edge})`} />
          <circle cx="24" cy="24" r="14.6" fill={`url(#${face})`} />
          <circle cx="24" cy="24" r="10.2" fill="#04110D" opacity="0.3" />
          <circle cx="24" cy="24" r="6.4" fill={`url(#${face})`} />
          <circle cx="24" cy="24" r="2.6" fill="#E9FBF6" />
          {/* arrow pinning the center */}
          <g stroke="#E9FBF6" strokeWidth="2.2" strokeLinecap="round">
            <path d="M24 24 38 10" />
          </g>
          <path d="M33.6 6.8 39 5l-1.8 5.4-3.6-.6Z" fill="#FBBF24" />
          <path d="M15 14c1.4-2.4 3.6-4.2 6.2-5.1" stroke="#fff" strokeOpacity="0.65" strokeWidth="1.7" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
