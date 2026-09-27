"use client";

import RichText from "@/components/ui/RichText";
import type { QuestionDTO } from "@/lib/types";
import { SingleChoiceView, MultipleChoiceView, type ChoiceViewProps } from "./ChoiceViews";
import StatementCombinationView from "./StatementCombinationView";
import MediaAttachmentView from "./MediaAttachmentView";

export type RendererProps = Omit<ChoiceViewProps, "options"> & {
  question: QuestionDTO;
};

/**
 * Dynamic question renderer — inspects `questionType` and switches views:
 *   SINGLE_CHOICE / SCENARIO_BASED → SingleChoiceView (radio)
 *   MULTIPLE_CHOICE               → MultipleChoiceView (checkbox)
 *   STATEMENT_COMBINATION         → StatementCombinationView (I/II/III + combos)
 * Media attachments wrap whichever choice view is active. Selection is
 * always a string[] (single = 1-element); grading stays text-based via
 * getCorrectSet/isAnswerCorrect in @/lib/question-type.
 */
export default function QuestionRenderer({ question, ...choice }: RendererProps) {
  const stem = (
    <div className="rounded-xl border p-4 mb-5" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
      <h3 className="text-[16px] font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}>
        <RichText text={question.question} />
      </h3>
      {question.questionType === "MULTIPLE_CHOICE" && (
        <p className="text-[11px] font-mono text-[var(--dashboard-text-muted)] mt-1.5">
          একাধিক উত্তর থাকতে পারে — সব সঠিকটি বেছে নিন
        </p>
      )}
    </div>
  );

  const body =
    question.questionType === "MULTIPLE_CHOICE" ? (
      <MultipleChoiceView options={question.options} {...choice} />
    ) : question.questionType === "STATEMENT_COMBINATION" ? (
      <StatementCombinationView statements={question.statements} options={question.options} {...choice} />
    ) : (
      <SingleChoiceView options={question.options} {...choice} />
    );

  return (
    <div>
      {stem}
      {question.media && question.media.length > 0 ? (
        <MediaAttachmentView media={question.media}>{body}</MediaAttachmentView>
      ) : (
        body
      )}
    </div>
  );
}
