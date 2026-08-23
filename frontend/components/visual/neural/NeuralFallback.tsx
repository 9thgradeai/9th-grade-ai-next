import { useMemo } from "react";
import { mulberry32, randUnit, range } from "./seededRandom";

interface FallbackNode {
  x: number;
  y: number;
  r: number;
  o: number;
}

/**
 * Static neural artwork (spec §24) — the intentional-looking fallback when
 * WebGL is unavailable or init fails. Procedurally generated inline SVG:
 * zero network cost, deterministic composition.
 */
export default function NeuralFallback({
  seed = 20260823,
  nodes = 64,
  className,
}: {
  seed?: number;
  nodes?: number;
  className?: string;
}) {
  const { circles, links } = useMemo(() => {
    const rng = mulberry32(seed);
    const pts: FallbackNode[] = [];
    for (let i = 0; i < nodes; i++) {
      // right-weighted cluster mirroring the live scene's composition
      const depth = rng();
      pts.push({
        x: 62 + (rng() - 0.35 + (1 - depth) * 0.18) * 34,
        y: 46 + randUnit(rng)[1] * (16 + depth * 14),
        r: 0.5 + depth * 2.6,
        o: 0.14 + depth * 0.5,
      });
    }
    const ls: { a: FallbackNode; b: FallbackNode; o: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      let bestJ = -1;
      let bestD = Infinity;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d > 0 && d < bestD && d < 22) {
          bestD = d;
          bestJ = j;
        }
      }
      if (bestJ >= 0 && rng() < 0.7) {
        ls.push({ a: pts[i], b: pts[bestJ], o: range(rng, 0.05, 0.16) });
      }
    }
    return { circles: pts, links: ls };
  }, [seed, nodes]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
      aria-hidden="true"
      data-neural-fallback="static-artwork"
    >
      <defs>
        <radialGradient id="nfb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(120 160 255)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="rgb(120 160 255)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="rgb(110 140 210)">
        {links.map((l, i) => (
          <line
            key={i}
            x1={l.a.x}
            y1={l.a.y}
            x2={l.b.x}
            y2={l.b.y}
            strokeWidth={0.12}
            strokeOpacity={l.o}
          />
        ))}
      </g>
      <g fill="rgb(140 170 240)">
        {circles.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={c.r * 3.4} fill="url(#nfb-glow)" opacity={c.o * 0.5} />
            <circle cx={c.x} cy={c.y} r={c.r} opacity={c.o} />
          </g>
        ))}
      </g>
    </svg>
  );
}
