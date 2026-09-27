"use client";

import RichText from "@/components/ui/RichText";

export type OptionRowState = {
  selected: boolean;
  locked: boolean;
  /** Null until answers are revealed — then colors the row. */
  verdict: "correct" | "wrong" | "dimmed" | null;
};

function rowStyle(selected: boolean, verdict: OptionRowState["verdict"]): React.CSSProperties {
  if (verdict === "correct") {
    return { background: "var(--dashboard-success-subtle)", borderColor: "var(--dashboard-success)", color: "var(--dashboard-success)" };
  }
  if (verdict === "wrong") {
    return { background: "var(--dashboard-danger-subtle)", borderColor: "var(--dashboard-danger)", color: "var(--dashboard-danger)" };
  }
  if (verdict === "dimmed") {
    return { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-muted)" };
  }
  if (selected) {
    return { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" };
  }
  return { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" };
}

export default function OptionRow({
  option,
  index,
  state,
  multi,
  onPick,
}: {
  option: string;
  index: number;
  state: OptionRowState;
  multi: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={state.locked}
      role={multi ? "checkbox" : "radio"}
      aria-checked={state.selected}
      className="w-full text-left p-3.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-not-allowed"
      style={rowStyle(state.selected, state.verdict)}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-6 h-6 flex-shrink-0 flex items-center justify-center text-xs font-mono border ${multi ? "rounded-md" : "rounded-full"}`}
          style={state.selected
            ? { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)", borderColor: "var(--dashboard-primary)" }
            : { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}
        >
          {multi ? (state.selected ? "✓" : "") : String.fromCharCode(65 + index)}
        </span>
        <span className="text-sm font-medium" style={{ fontFamily: "inherit" }}>
          <RichText text={option} />
        </span>
      </div>
    </button>
  );
}
