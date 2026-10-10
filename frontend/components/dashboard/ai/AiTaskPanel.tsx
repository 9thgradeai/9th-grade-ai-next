"use client";

import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import AISourceFooter from "./AISourceFooter";

type AiTaskPanelProps = {
  title: string;
  description: string;
  submitLabel: string;
  loadingLabel: string;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
  fields: ReactNode;
  result?: ReactNode | null;
  resultActions?: ReactNode | null;
  sourceProvider?: string | null;
  sourceModel?: string | null;
};

/**
 * Shared shell for single-shot AI task tabs (advisor, evaluator, …):
 * header → form card with submit → loading skeleton → structured
 * result card with action row and AI provenance footer. Each tab
 * keeps its own state/validation and passes render content as props,
 * so the layout, error slot, button, skeleton and source line stay
 * identical across every AI task surface.
 */
export default function AiTaskPanel({
  title,
  description,
  submitLabel,
  loadingLabel,
  loading,
  error,
  onSubmit,
  fields,
  result,
  resultActions,
  sourceProvider,
  sourceModel,
}: AiTaskPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--dashboard-text-muted)]">{description}</p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {fields}
        {error && <p className="text-sm text-[var(--dashboard-danger)]">{error}</p>}
        <Button type="submit" variant="primary" size="md" className="self-start" disabled={loading}>
          {loading ? loadingLabel : submitLabel}
        </Button>
      </form>

      {loading && <SkeletonCard />}

      {result && !loading && (
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-5">
          {result}
          {resultActions && <div className="flex flex-wrap gap-2">{resultActions}</div>}
          <AISourceFooter provider={sourceProvider ?? null} model={sourceModel ?? null} />
        </div>
      )}
    </div>
  );
}
