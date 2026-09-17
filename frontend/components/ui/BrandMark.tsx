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
 * No intrinsic shadow — the wrapper controls any elevation.
 */
import { useId } from "react";

export default function BrandMark({
  className = "",
  title,
}: {
  className?: string;
  /** Accessible name; omit when the surrounding link already labels the mark. */
  title?: string;
}) {
  const reactId = useId();
  const gid = `brandmark-${reactId.replace(/:/g, "")}`;

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
        <radialGradient id={`${gid}-g`} cx="50%" cy="50%" r="68%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </radialGradient>
        <linearGradient id={`${gid}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      {/* Fixed premium tile — always dark/indigo so it pops on white sidebar & dark sidebar */}
      <rect width="64" height="64" rx="14" fill={`url(#${gid}-bg)`} />
      <rect width="64" height="64" rx="14" fill="none" stroke="white" strokeOpacity="0.08" />
      <circle cx="32" cy="32" r="24" fill="none" stroke={`url(#${gid}-g)`} strokeWidth="1.8" opacity="0.9" />
      <circle cx="32" cy="32" r="6.5" fill="white" />
      <circle cx="32" cy="32" r="6.5" fill={`url(#${gid}-g)`} opacity="0.95" />
      <circle cx="32" cy="11.5" r="3.2" fill="white" fillOpacity="0.96" />
      <circle cx="13.5" cy="26" r="3.2" fill="white" fillOpacity="0.96" />
      <circle cx="50.5" cy="26" r="3.2" fill="white" fillOpacity="0.96" />
      <circle cx="32" cy="52.5" r="3.2" fill="white" fillOpacity="0.96" />
      <g stroke="white" strokeWidth="1.15" opacity="0.55">
        <line x1="32" y1="32" x2="32" y2="11.5" />
        <line x1="32" y1="32" x2="13.5" y2="26" />
        <line x1="32" y1="32" x2="50.5" y2="26" />
        <line x1="32" y1="32" x2="32" y2="52.5" />
      </g>
    </svg>
  );
}