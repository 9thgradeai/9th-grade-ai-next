"use client";

import RichText from "@/components/ui/RichText";
import { SingleChoiceView, type ChoiceViewProps } from "./ChoiceViews";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/**
 * Statement-combination layout: numbered I/II/III stems in a stack, with the
 * combination options ("1 and 2 only", "All of the above", …) rendered as a
 * standard single-choice list below. Combination options never shuffle —
 * shuffleSessionOptions already order-locks letter-referencing questions.
 */
export default function StatementCombinationView({
  statements,
  ...choice
}: ChoiceViewProps & { statements: string[] }) {
  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {statements.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl border border-terminal-border bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-[var(--dashboard-text-primary)]"
          >
            <span className="font-mono font-bold text-[var(--dashboard-primary)] flex-shrink-0">
              {ROMAN[i] ?? i + 1}.
            </span>
            <RichText text={s} />
          </li>
        ))}
      </ol>
      <SingleChoiceView {...choice} />
    </div>
  );
}
