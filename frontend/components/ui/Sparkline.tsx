type SparklineProps = {
  values: number[];
  className?: string;
  strokeClassName?: string;
  fillId?: string;
  ariaLabel?: string;
};

export default function Sparkline({
  values,
  className = "",
  strokeClassName = "text-[var(--dashboard-primary)]",
  fillId,
  ariaLabel,
}: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 30;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;

  const trend = values[values.length - 1] >= values[0] ? "বেড়েছে" : "কমেছে";
  const descriptiveLabel =
    ariaLabel ?? `স্কোর ট্রেন্ড — শেষ ${values.length}টি মান, ${trend}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`w-full h-7 ${strokeClassName} ${className}`}
      role="img"
      aria-label={descriptiveLabel}
    >
      {fillId ? (
        <>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${fillId})`} />
        </>
      ) : null}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
