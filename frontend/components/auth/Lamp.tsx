"use client";

export function Lamp({ lit, interactive, onActivate }: { lit: boolean; interactive: boolean; onActivate: () => void }) {
  const body = (
    <svg viewBox="0 0 220 300" className="h-32 w-24 sm:h-40 sm:w-30" role="img" aria-hidden="true">
      <defs>
        <radialGradient id="lamp-base" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#5b4220" />
          <stop offset="55%" stopColor="#33230f" />
          <stop offset="100%" stopColor="#1a1106" />
        </radialGradient>
        <linearGradient id="lamp-stem" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#120b04" />
          <stop offset="40%" stopColor="#4a3a22" />
          <stop offset="100%" stopColor="#1a1106" />
        </linearGradient>
        <linearGradient id="lamp-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#065f46" />
          <stop offset="60%" stopColor="#03301f" />
          <stop offset="100%" stopColor="#02180f" />
        </linearGradient>
        <radialGradient id="lamp-bulb" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffedb3" />
          <stop offset="70%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id="lamp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(251,191,36,0.5)" />
          <stop offset="100%" stopColor="rgba(251,191,36,0)" />
        </radialGradient>
      </defs>

      {lit && <circle cx="110" cy="176" r="86" fill="url(#lamp-glow)" className="lamp-breathe" />}

      <ellipse cx="110" cy="278" rx="64" ry="13" fill="url(#lamp-base)" />
      <ellipse cx="110" cy="272" rx="40" ry="8" fill="#0d0803" />
      <rect x="102" y="170" width="16" height="104" rx="8" fill="url(#lamp-stem)" />
      <ellipse cx="110" cy="172" rx="10" ry="6" fill="#241505" />

      <path
        d="M 70 112 Q 70 102 80 102 L 140 102 Q 150 102 150 112 L 164 160 Q 164 170 152 170 L 68 170 Q 56 170 56 160 Z"
        fill="url(#lamp-shade)"
      />
      <path
        d="M 80 102 L 140 102 L 152 170 L 68 170 Z"
        fill="none"
        stroke="rgba(52,211,153,0.35)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="110" cy="86" r="7" fill="#d4a24e" />

      <ellipse cx="110" cy="176" rx="11" ry="13" fill="url(#lamp-bulb)" />
    </svg>
  );

  if (!interactive) {
    return <div aria-hidden="true">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label="Turn on the light"
      aria-pressed={lit}
      className="group flex cursor-pointer flex-col items-center rounded-2xl outline-none transition-transform duration-300 focus-visible:ring-2 focus-visible:ring-emerald-400/80 hover:scale-[1.03] active:scale-[0.98]"
    >
      {body}
      <span className="sr-only">Turn on the light</span>
    </button>
  );
}