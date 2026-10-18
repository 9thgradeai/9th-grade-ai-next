"use client";

import OptionRow, { type OptionRowState } from "./OptionRow";

export type ChoiceViewProps = {
  options: string[];
  selected: string[];
  locked: boolean;
  /** Null until reveal, then rows color by membership in correctSet. */
  correctSet?: string[] | null;
  onSelect: (next: string[]) => void;
};

function verdictFor(option: string, selected: string[], correctSet: string[] | null | undefined): OptionRowState["verdict"] {
  if (!correctSet) return null;
  const isAnswer = correctSet.includes(option.trim());
  const isPicked = selected.map((s) => s.trim()).includes(option.trim());
  if (isAnswer) return "correct";
  if (isPicked) return "wrong";
  return "dimmed";
}

/** Standard one-answer question, radio semantics. */
export function SingleChoiceView({ options, selected, locked, correctSet, onSelect }: ChoiceViewProps) {
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="sr-only">উত্তর নির্বাচন করুন, একটি বেছে নিন</legend>
      <div className="space-y-2.5">
      {options.map((option, i) => (
        <OptionRow
          key={i}
          option={option}
          index={i}
          multi={false}
          state={{ selected: selected.includes(option), locked, verdict: verdictFor(option, selected, correctSet) }}
          onPick={() => onSelect([option])}
        />
      ))}
      </div>
    </fieldset>
  );
}

/** Multi-answer question, checkbox toggle semantics, locked on submit. */
export function MultipleChoiceView({ options, selected, locked, correctSet, onSelect }: ChoiceViewProps) {
  const toggle = (option: string) => {
    if (locked) return;
    onSelect(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);
  };
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="sr-only">একাধিক উত্তর নির্বাচন করুন, সব সঠিকটি বেছে নিন</legend>
      <div className="space-y-2.5">
      {options.map((option, i) => (
        <OptionRow
          key={i}
          option={option}
          index={i}
          multi
          state={{ selected: selected.includes(option), locked, verdict: verdictFor(option, selected, correctSet) }}
          onPick={() => toggle(option)}
        />
      ))}
      </div>
    </fieldset>
  );
}
