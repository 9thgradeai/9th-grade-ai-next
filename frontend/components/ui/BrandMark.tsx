import { useId } from "react";

/**
 * The official 9Th-Grade AI brand mark — a knowledge constellation:
 * four connected nodes orbiting a luminous core on a deep-space tile,
 * ringed by the product's blue→cyan→violet spectrum.
 *
 * Source of truth: /assets/favicon.svg. Rendered inline (not an <img>) so it
 * stays crisp at any size and inherits layout like any other element.
 * Gradient ids are namespaced per instance so multiple marks can coexist.
 * Uses currentColor so it inherits the text color of its parent context,
 * making it theme-aware across light/dark dashboard modes.
 */
export default function BrandMark({
  className = "",
  title,
}: {
  className?: string;
  /** Accessible name; omit when the surrounding link already labels the mark. */
  title?: string;
}) {
  const gid = `brandmark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`${gid}-g`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#4f7cff" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <circle cx="32" cy="32" r="26" fill="none" stroke={`url(#${gid}-g)`} strokeWidth="2" opacity="0.55" />
      <circle cx="32" cy="32" r="6" fill="currentColor" />
      <circle cx="32" cy="10" r="3" fill="currentColor" />
      <circle cx="12" cy="26" r="3" fill="currentColor" />
      <circle cx="52" cy="26" r="3" fill="currentColor" />
      <circle cx="32" cy="54" r="3" fill="currentColor" />
      <g stroke="#9aa3b8" strokeWidth="1.2" opacity="0.7">
        <line x1="32" y1="32" x2="32" y2="10" />
        <line x1="32" y1="32" x2="12" y2="26" />
        <line x1="32" y1="32" x2="52" y2="26" />
        <line x1="32" y1="32" x2="32" y2="54" />
      </g>
    </svg>
  );
}
