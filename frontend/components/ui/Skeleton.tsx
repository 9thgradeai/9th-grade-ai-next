import type { ReactNode } from "react";

const SKELETON = "skeleton-shimmer rounded-lg";

/** Base skeleton block. Decorative — hidden from assistive tech. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`${SKELETON} ${className}`} />;
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
