"use client";

import { motion } from "framer-motion";
import {
  avatarStates,
  type AuthAvatarState,
  type BrowKind,
  type EyeKind,
  type FocusField,
  type Gaze,
  type MouthKind,
} from "./auth-state";

const LINE = "#43200a";
const IRIS = "#3b1a05";

const GAZE_OFFSET: Record<Gaze, [number, number]> = {
  left: [-4, 0],
  right: [4, 0],
  up: [0, -3.5],
  down: [0, 3.5],
};

function Eye({ kind, cx, cy, gaze }: { kind: EyeKind; cx: number; cy: number; gaze?: Gaze }) {
  const [dx, dy] = gaze ? GAZE_OFFSET[gaze] : [0, 0];

  if (kind === "happy") {
    return <path d={`M ${cx - 13} ${cy + 5} Q ${cx} ${cy - 15} ${cx + 13} ${cy + 5}`} fill="none" stroke={LINE} strokeWidth={5.5} strokeLinecap="round" />;
  }
  if (kind === "closed") {
    return <path d={`M ${cx - 13} ${cy + 1} Q ${cx} ${cy + 9} ${cx + 13} ${cy + 1}`} fill="none" stroke={LINE} strokeWidth={5.5} strokeLinecap="round" />;
  }
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={12} ry={14} fill="#fff7e6" />
      <circle cx={cx + dx} cy={cy + dy} r={6.5} fill={IRIS} />
      <circle cx={cx + dx + 2.4} cy={cy + dy - 2.6} r={2.1} fill="#fff" />
      {kind === "lid" && (
        <path d={`M ${cx - 13} ${cy - 3} Q ${cx} ${cy - 8} ${cx + 13} ${cy - 3}`} fill="none" stroke={LINE} strokeWidth={4} strokeLinecap="round" />
      )}
    </g>
  );
}

function Brow({ kind, cx, cy }: { kind: BrowKind; cx: number; cy: number }) {
  const w = 15;
  if (kind === "curious") {
    return (
      <path
        d={`M ${cx - w} ${cy - 5} Q ${cx - w / 2} ${cy - 9} ${cx} ${cy - 7} Q ${cx + w / 2} ${cy - 5} ${cx + w} ${cy - 2}`}
        fill="none"
        stroke={LINE}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.6}
      />
    );
  }
  if (kind === "concerned") {
    return (
      <path
        d={`M ${cx - w} ${cy - 1} Q ${cx - w / 2} ${cy - 8} ${cx} ${cy - 6} Q ${cx + w / 2} ${cy - 2} ${cx + w} ${cy - 4}`}
        fill="none"
        stroke={LINE}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.7}
      />
    );
  }
  return (
    <path d={`M ${cx - w} ${cy} Q ${cx} ${cy - 4} ${cx + w} ${cy}`} fill="none" stroke={LINE} strokeWidth={4} strokeLinecap="round" opacity={0.5} />
  );
}

function Mouth({ kind }: { kind: MouthKind }) {
  if (kind === "wide") {
    return (
      <g>
        <path d="M 100 150 Q 120 176 140 150 Z" fill="#7c2d12" />
        <path d="M 102 152 Q 120 171 138 152 Z" fill="#b45309" />
      </g>
    );
  }
  if (kind === "small") {
    return <path d="M 110 156 Q 120 165 130 156" fill="none" stroke={LINE} strokeWidth={5} strokeLinecap="round" />;
  }
  if (kind === "flat") {
    return <path d="M 110 159 L 130 159" fill="none" stroke={LINE} strokeWidth={5} strokeLinecap="round" />;
  }
  if (kind === "open") {
    return (
      <g>
        <ellipse cx={120} cy={157} rx={9} ry={11} fill="#7c2d12" />
        <ellipse cx={120} cy={163} rx={6} ry={4} fill="#b45309" />
      </g>
    );
  }
  if (kind === "frown") {
    return <path d="M 106 164 Q 120 148 134 164" fill="none" stroke={LINE} strokeWidth={6} strokeLinecap="round" />;
  }
  return <path d="M 104 152 Q 120 167 136 152" fill="none" stroke={LINE} strokeWidth={6} strokeLinecap="round" />;
}

function Sparkle() {
  return (
    <path
      d="M 198 66 Q 198 74 206 74 Q 198 74 198 82 Q 198 74 190 74 Q 198 74 198 66 Z"
      fill="#fbbf24"
      className="avatar-sparkle"
    />
  );
}

export function Avatar({ mood, focusField }: { mood: AuthAvatarState; focusField?: FocusField }) {
  const cfg = avatarStates[mood];
  // The avatar sits above the interaction area, so when a field is focused it
  // looks down toward it (attentive), unless the state explicitly sets a gaze.
  const gaze = cfg.expression.gaze ?? (focusField ? "down" : undefined);

  return (
    <div className="relative flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.9 }}
        animate={{ opacity: 1, y: [0, -7, 0], scale: 1 }}
        transition={{
          opacity: { duration: 0.55, ease: "easeOut" },
          y: { duration: 3.6, repeat: Infinity, ease: "easeInOut" },
          scale: { duration: 0.55, ease: "easeOut" },
        }}
        className="relative"
      >
        <svg viewBox="0 0 240 240" className="h-36 w-36 sm:h-44 sm:w-44" role="img" aria-label="A friendly companion guiding you through sign in">
          <defs>
            <radialGradient id="avatar-body" cx="38%" cy="32%" r="78%">
              <stop offset="0%" stopColor="#fff1cf" />
              <stop offset="48%" stopColor="#ffd98a" />
              <stop offset="100%" stopColor="#f4b45f" />
            </radialGradient>
            <radialGradient id="avatar-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(251,191,36,0.35)" />
              <stop offset="100%" stopColor="rgba(251,191,36,0)" />
            </radialGradient>
          </defs>

          <circle cx="120" cy="120" r="112" fill="url(#avatar-halo)" />
          <ellipse cx="120" cy="218" rx="50" ry="9" fill="#1c1508" opacity="0.28" />
          <ellipse cx="120" cy="136" rx="84" ry="77" fill="url(#avatar-body)" />
          <ellipse cx="120" cy="136" rx="84" ry="77" fill="none" stroke="#b45309" strokeOpacity="0.16" strokeWidth="2" />
          <ellipse cx="102" cy="92" rx="30" ry="16" fill="#ffffff" opacity="0.3" transform="rotate(-16 102 92)" />

          <g key={mood} className="avatar-face-fade">
            <Brow kind={cfg.expression.brows} cx={92} cy={94} />
            <Brow kind={cfg.expression.brows} cx={148} cy={94} />
            <g className="avatar-blink">
              <Eye kind={cfg.expression.eyes} cx={92} cy={122} gaze={gaze} />
              <Eye kind={cfg.expression.eyes} cx={148} cy={122} gaze={gaze} />
            </g>
            {cfg.expression.blush && (
              <g>
                <ellipse cx="80" cy="146" rx="9" ry="5" fill="#ef4444" opacity="0.28" />
                <ellipse cx="160" cy="146" rx="9" ry="5" fill="#ef4444" opacity="0.28" />
              </g>
            )}
            <Mouth kind={cfg.expression.mouth} />
          </g>

          {cfg.sparkle && <Sparkle />}
        </svg>
      </motion.div>
    </div>
  );
}