import type { CSSProperties, ReactNode } from "react";

const SKELETON = "skeleton-shimmer rounded-lg";

/** Base skeleton block. Decorative — hidden from assistive tech. */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`${SKELETON} ${className}`} style={style} />;
}

/** Skeleton line for text placeholders. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`${SKELETON} h-4`} style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Card-shaped loading placeholder used while tab chunks/data load. */
export function SkeletonCard({
  className = "",
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`glass-card rounded-2xl border border-[var(--border-subtle)] p-6 ${className}`}
    >
      <span className="sr-only">Loading…</span>
      {children ?? (
        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <SkeletonText lines={3} />
        </div>
      )}
    </div>
  );
}

/** Table-shaped placeholder (question bank / mistake lists): header + rows. */
export function SkeletonTable({
  rows = 5,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className={`glass-card rounded-2xl border border-[var(--border-subtle)] p-4 ${className}`}>
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-2.5">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4" style={{ width: `${92 - (i % 3) * 14}%` }} />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tile-grid placeholder (stats decks / vocab decks / badge grids). */
export function SkeletonDeck({
  tiles = 4,
  className = "",
}: {
  tiles?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="glass-card rounded-2xl border border-[var(--border-subtle)] p-4 space-y-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
