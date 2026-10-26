"use client";

import { useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  Warning,
  Question,
  ShieldCheck,
  ShieldWarning,
  Books,
  Lightning,
  Globe,
  Flag,
  Info,
} from "@phosphor-icons/react";
import type { VerifiedExplanationDto, VerifiedOptionAnalysis } from "@/lib/types/verified-explanation";
import RichText from "@/components/ui/RichText";
import AISourceFooter from "./AISourceFooter";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const keyOf = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

type StatusMeta = { bn: string; en: string; tone: string; Icon: typeof ShieldCheck };

const STATUS_META: Record<VerifiedExplanationDto["verificationStatus"], StatusMeta> = {
  EVIDENCE_VERIFIED: {
    bn: "প্রমাণসহ যাচাইকৃত",
    en: "verified with sources",
    tone: "var(--dashboard-success)",
    Icon: ShieldCheck,
  },
  INDEPENDENTLY_VERIFIED: {
    bn: "স্বাধীনভাবে যাচাইকৃত",
    en: "two isolated passes agree",
    tone: "var(--dashboard-success)",
    Icon: ShieldCheck,
  },
  PARTIALLY_VERIFIED: {
    bn: "আংশিক যাচাইকৃত",
    en: "partial support",
    tone: "var(--dashboard-warning)",
    Icon: ShieldWarning,
  },
  INCONCLUSIVE: {
    bn: "সিদ্ধান্তহীন",
    en: "inconclusive",
    tone: "var(--dashboard-warning)",
    Icon: Question,
  },
  NOT_VERIFIED: {
    bn: "যাচাই করা যায়নি",
    en: "not verified",
    tone: "var(--dashboard-text-muted)",
    Icon: ShieldWarning,
  },
  PROVIDER_FAILED: {
    bn: "সেবা অনুপলব্ধ",
    en: "provider failed",
    tone: "var(--dashboard-danger)",
    Icon: XCircle,
  },
};

const VALIDITY_META: Record<VerifiedExplanationDto["questionValidity"], { bn: string; en: string }> = {
  VALID_SINGLE_ANSWER: { bn: "বৈধ · একক সঠিক উত্তর", en: "valid single answer" },
  VALID_MULTIPLE_ANSWERS: { bn: "একাধিক সঠিক উত্তর", en: "multiple defensible answers" },
  NO_CORRECT_OPTION: { bn: "কোনো সঠিক অপশন নেই", en: "no correct option" },
  AMBIGUOUS: { bn: "অস্পষ্ট প্রশ্ন", en: "ambiguous wording" },
  INCOMPLETE_OR_MALFORMED: { bn: "ত্রুটিপূর্ণ/অসম্পূর্ণ", en: "malformed" },
  OUTDATED_OR_CONTEXT_DEPENDENT: { bn: "তারিখ/প্রেক্ষাপট নির্ভর", en: "context dependent" },
  INCONCLUSIVE: { bn: "সিদ্ধান্তহীন", en: "inconclusive" },
};

const AUDIT_META: Record<VerifiedExplanationDto["databaseAuditStatus"], { bn: string; en: string }> = {
  NOT_AUDITED: { bn: "যাচাই হয়নি", en: "not audited" },
  AGREES: { bn: "সংরক্ষিত কী-এর সাথে মিলে", en: "agrees with stored key" },
  KEY_MISMATCH: { bn: "সংরক্ষিত কী-এর সাথে অমিল", en: "key mismatch" },
  INVALID_QUESTION: { bn: "প্রশ্নটি ত্রুটিপূর্ণ", en: "invalid question" },
  MULTIPLE_ANSWERS: { bn: "একাধিক সঠিক উত্তর", en: "multiple answers" },
  AMBIGUOUS_QUESTION: { bn: "প্রশ্ন অস্পষ্ট", en: "ambiguous question" },
  CONTEXT_OR_DATE_MISMATCH: { bn: "তারিখ/প্রেক্ষাপট অমিল", en: "context/date mismatch" },
  INCONCLUSIVE: { bn: "অডিট সিদ্ধান্তহীন", en: "audit inconclusive" },
};

const VERDICT_META: Record<
  VerifiedOptionAnalysis["verdict"],
  { bn: string; tone: string; Icon: typeof CheckCircle }
> = {
  CORRECT: { bn: "সঠিক", tone: "var(--dashboard-success)", Icon: CheckCircle },
  INCORRECT: { bn: "ভুল", tone: "var(--dashboard-danger)", Icon: XCircle },
  CONDITIONALLY_CORRECT: { bn: "শর্তসাপেক্ষে সঠিক", tone: "var(--dashboard-warning)", Icon: Warning },
  INDETERMINATE: { bn: "নিরূপণ করা যায়নি", tone: "var(--dashboard-text-muted)", Icon: Question },
};

const STUDENT_RESULT_BN: Record<NonNullable<VerifiedExplanationDto["independentStudentResult"]>, string> = {
  CORRECT: "সঠিক",
  INCORRECT: "ভুল",
  UNANSWERED: "উত্তর দেওয়া হয়নি",
  NOT_SCORED: "স্কোর করা যায়নি",
};

const SEARCH_META: Record<VerifiedExplanationDto["evidence"]["searchStatus"], { bn: string; en: string }> = {
  NOT_ATTEMPTED: { bn: "ওয়েব সার্চ করা হয়নি", en: "no web search" },
  LIVE_SEARCH: { bn: "লাইভ সার্চ", en: "live search" },
  CACHED_EVIDENCE: { bn: "ক্যাশ করা প্রমাণ", en: "cached evidence" },
  NO_RESULTS: { bn: "কোনো ফলাফল নেই", en: "no results" },
  UNAVAILABLE: { bn: "সার্চ অনুপলব্ধ", en: "search unavailable" },
  FAILED: { bn: "সার্চ ব্যর্থ", en: "search failed" },
};

function Badge({
  children,
  tone,
  Icon,
}: {
  children: React.ReactNode;
  tone: string;
  Icon?: typeof CheckCircle;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider"
      style={{ color: tone, borderColor: tone, background: "transparent" }}
    >
      {Icon ? <Icon className="w-3 h-3" weight="bold" /> : null}
      {children}
    </span>
  );
}

function SectionTitle({
  children,
  tone = "var(--dashboard-primary)",
  Icon,
}: {
  children: React.ReactNode;
  tone?: string;
  Icon: typeof CheckCircle;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="w-3.5 h-3.5" style={{ color: tone }} />
      <span
        className="text-[11px] font-mono font-bold uppercase tracking-wider"
        style={{ color: tone }}
      >
        {children}
      </span>
    </div>
  );
}

export default function VerifiedExplanation({
  result,
  displayOptions,
}: {
  result: VerifiedExplanationDto;
  displayOptions: readonly string[];
}) {
  const analysisById = useMemo(() => {
    const map = new Map<string, VerifiedOptionAnalysis>();
    for (const analysis of result.optionsAnalysis) map.set(analysis.originalOptionId, analysis);
    return map;
  }, [result.optionsAnalysis]);

  const displayLabel = useMemo(() => {
    const lookup = new Map<string, string>();
    displayOptions.forEach((text, index) => {
      lookup.set(keyOf(text), LETTERS[index] ?? String(index + 1));
    });
    const labels = new Map<string, string>();
    for (const analysis of result.optionsAnalysis) {
      labels.set(analysis.originalOptionId, lookup.get(keyOf(analysis.text)) ?? analysis.label);
    }
    return labels;
  }, [displayOptions, result.optionsAnalysis]);

  const orderedAnalyses = useMemo(() => {
    const used = new Set<string>();
    const out: VerifiedOptionAnalysis[] = [];
    displayOptions.forEach((text) => {
      const match = result.optionsAnalysis.find(
        (analysis) => !used.has(analysis.originalOptionId) && keyOf(analysis.text) === keyOf(text),
      );
      if (match) {
        used.add(match.originalOptionId);
        out.push(match);
      }
    });
    for (const analysis of result.optionsAnalysis) {
      if (!used.has(analysis.originalOptionId)) out.push(analysis);
    }
    return out;
  }, [displayOptions, result.optionsAnalysis]);

  const status = STATUS_META[result.verificationStatus];
  const validity = VALIDITY_META[result.questionValidity];
  const audit = AUDIT_META[result.databaseAuditStatus];
  const search = SEARCH_META[result.evidence.searchStatus];
  const acceptedLabels = result.acceptedOptionIds
    .map((id) => displayLabel.get(id) ?? analysisById.get(id)?.label ?? id)
    .sort();
  const selectedLabels = result.selectedOptionIds
    .map((id) => displayLabel.get(id) ?? id)
    .sort();
  const keyDiscrepancy =
    result.databaseAuditStatus !== "AGREES" && result.databaseAuditStatus !== "NOT_AUDITED";

  return (
    <div
      className="mt-3 rounded-xl border p-4 space-y-4"
      style={{
        background: "var(--dashboard-surface-raised)",
        borderColor: "var(--primary)",
        borderStyle: "dashed",
      }}
    >
      {/* 1. Verification status + validity */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone} Icon={status.Icon}>
          {status.bn}
        </Badge>
        <Badge tone="var(--dashboard-text-secondary)">{validity.bn}</Badge>
        {result.metadata?.cacheHit ? (
          <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">
            cached · {result.metadata.llmCalls} LLM · {result.metadata.searchCalls} search
          </span>
        ) : null}
      </div>
      <p className="text-[11px] font-mono text-[var(--dashboard-text-muted)]">
        <RichText text={result.coreConcept} />
      </p>

      {/* Malformed structure */}
      {result.invalidInput ? (
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--dashboard-danger)", background: "var(--dashboard-surface)" }}
        >
          <SectionTitle tone="var(--dashboard-danger)" Icon={Warning}>
            ত্রুটিপূর্ণ প্রশ্ন · malformed
          </SectionTitle>
          <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
            <RichText text={result.invalidInput.reason} />
          </p>
          {result.invalidInput.issues.length > 0 ? (
            <ul className="mt-1 list-disc list-inside text-[11px] text-[var(--dashboard-text-muted)]">
              {result.invalidInput.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-[11px] text-[var(--dashboard-text-muted)]">
            মূল প্রশ্ন ও অপশন অপরিবর্তিত রাখা হয়েছে; কোনো অপশন বানানো হয়নি।
          </p>
        </div>
      ) : null}

      {/* 2. Independent answer */}
      {result.questionValidity !== "INCOMPLETE_OR_MALFORMED" ? (
        <div>
          <SectionTitle
            tone={
              result.questionValidity === "NO_CORRECT_OPTION"
                ? "var(--dashboard-danger)"
                : "var(--dashboard-success)"
            }
            Icon={result.questionValidity === "NO_CORRECT_OPTION" ? XCircle : CheckCircle}
          >
            স্বাধীন বিশ্লেষণ · independent finding
          </SectionTitle>
          {result.questionValidity === "NO_CORRECT_OPTION" ? (
            <p className="text-xs font-semibold" style={{ color: "var(--dashboard-danger)" }}>
              কোনো প্রদত্ত অপশন সঠিক হিসেবে প্রতিষ্ঠিত হয়নি।
            </p>
          ) : result.independentAnswer.established ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {acceptedLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-mono font-bold"
                  style={{
                    color: "var(--dashboard-success)",
                    background: "var(--dashboard-surface)",
                    border: "1px solid var(--dashboard-success)",
                  }}
                >
                  {label}
                </span>
              ))}
              <span className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
                {result.independentAnswer.summary ? (
                  <RichText text={result.independentAnswer.summary} />
                ) : null}
              </span>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--dashboard-warning)" }}>
              {result.independentAnswer.summary ? (
                <RichText text={result.independentAnswer.summary} />
              ) : (
                "স্বাধীন বিশ্লেষণ কোনো একক উত্তর প্রতিষ্ঠা করতে পারেনি।"
              )}
            </p>
          )}
        </div>
      ) : null}

      {/* 2b. Ambiguity / defect note from the independent passes */}
      {result.ambiguityOrDefect?.detected ? (
        <div
          className="rounded-lg border p-3"
          style={{
            borderColor: "var(--dashboard-warning)",
            background: "var(--dashboard-warning-subtle, var(--dashboard-surface))",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Warning className="w-3.5 h-3.5 text-[var(--dashboard-warning)]" weight="bold" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-warning)]">
              প্রশ্ন/কী ত্রুটি · ambiguity or defect
            </span>
          </div>
          {result.ambiguityOrDefect.type ? (
            <p className="mt-1 text-[11px] font-mono text-[var(--dashboard-text-muted)]">
              {result.ambiguityOrDefect.type}
            </p>
          ) : null}
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
            {result.ambiguityOrDefect.explanation ? (
              <RichText text={result.ambiguityOrDefect.explanation} />
            ) : (
              "স্বাধীন বিশ্লেষণে প্রশ্ন বা উত্তর-কীর একটি সম্ভাব্য ত্রুটি চিহ্নিত হয়েছে; এটি মানুষ কর্তৃক পর্যালোচনার বিষয়।"
            )}
          </p>
        </div>
      ) : null}

      {/* 3. Student selection + original result */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className="rounded-lg p-2.5"
          style={{ background: "var(--dashboard-surface)", border: "1px solid var(--dashboard-border)" }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)]">
            আপনার উত্তর
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>
            {selectedLabels.length > 0 ? selectedLabels.join(", ") : "উত্তর দেওয়া হয়নি"}
          </p>
        </div>
        <div
          className="rounded-lg p-2.5"
          style={{ background: "var(--dashboard-surface)", border: "1px solid var(--dashboard-border)" }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)]">
            মূল কী অনুযায়ী ফলাফল (অপরিবর্তিত)
          </p>
          <p
            className="text-xs mt-0.5 font-semibold"
            style={{
              color:
                result.studentResult === "CORRECT"
                  ? "var(--dashboard-success)"
                  : result.studentResult === "UNANSWERED"
                    ? "var(--dashboard-text-muted)"
                    : "var(--dashboard-danger)",
            }}
          >
            {STUDENT_RESULT_BN[result.studentResult]}
            {result.independentStudentResult &&
            result.independentStudentResult !== result.studentResult ? (
              <span className="ml-1 font-normal text-[var(--dashboard-text-muted)]">
                · স্বাধীন বিশ্লেষণে {STUDENT_RESULT_BN[result.independentStudentResult]}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {/* Database-key discrepancy notice */}
      {keyDiscrepancy ? (
        <div
          className="rounded-lg border p-3"
          style={{
            borderColor: "var(--dashboard-warning)",
            background: "var(--dashboard-warning-subtle, var(--dashboard-surface))",
          }}
        >
          <SectionTitle tone="var(--dashboard-warning)" Icon={Flag}>
            ডেটাবেস কী পর্যালোচনা · stored key under review
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge tone="var(--dashboard-warning)">{audit.bn}</Badge>
            {result.databaseAudit?.reviewStatus === "PENDING_REVIEW" ? (
              <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                human review pending
              </span>
            ) : null}
          </div>
          {result.databaseAudit?.discrepancyExplanation ? (
            <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
              <RichText text={result.databaseAudit.discrepancyExplanation} />
            </p>
          ) : null}
          {result.databaseAudit?.databaseKeyText ? (
            <p className="mt-1 text-[11px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
              সংরক্ষিত কী: <RichText text={result.databaseAudit.databaseKeyText} />
            </p>
          ) : null}
          <p className="mt-1 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
            আপনার সম্পন্ন পরীক্ষার উত্তর বা স্কোর স্বয়ংক্রিয়ভাবে পরিবর্তন করা হয়নি। সংশোধন হলে তা আলাদা
            পর্যালোচনার মাধ্যমে হবে।
          </p>
        </div>
      ) : null}

      {/* 4. Every original option */}
      <div>
        <SectionTitle Icon={Books}>প্রতিটি অপশনের বিশ্লেষণ · option analysis</SectionTitle>
        <div className="space-y-2">
          {orderedAnalyses.map((analysis) => {
            const verdict = VERDICT_META[analysis.verdict];
            const label = displayLabel.get(analysis.originalOptionId) ?? analysis.label;
            return (
              <div
                key={analysis.originalOptionId}
                className="rounded-lg p-2.5"
                style={{
                  background: "var(--dashboard-surface)",
                  borderLeft: `3px solid ${verdict.tone}`,
                }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-mono font-bold"
                    style={{ color: verdict.tone, border: `1px solid ${verdict.tone}` }}
                  >
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        className="text-xs font-medium break-words"
                        style={{ color: "var(--dashboard-text-primary)" }}
                      >
                        <RichText text={analysis.text} />
                      </span>
                      <Badge tone={verdict.tone} Icon={verdict.Icon}>
                        {verdict.bn}
                      </Badge>
                    </div>
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: "var(--dashboard-text-secondary)" }}
                    >
                      <RichText text={analysis.explanation} />
                    </p>
                    {analysis.conditions ? (
                      <p className="mt-1 text-[11px]" style={{ color: "var(--dashboard-warning)" }}>
                        শর্ত: <RichText text={analysis.conditions} />
                      </p>
                    ) : null}
                    {analysis.limitations ? (
                      <p className="mt-1 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                        <RichText text={analysis.limitations} />
                      </p>
                    ) : null}
                    {analysis.evidenceIds.length > 0 ? (
                      <p className="mt-1 text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                        sources: {analysis.evidenceIds.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Steps */}
      {result.solutionSteps.length > 0 ? (
        <div>
          <SectionTitle Icon={Lightning}>ধাপে ধাপে সমাধান · reasoning</SectionTitle>
          <ol
            className="list-decimal list-inside space-y-1 text-xs"
            style={{ color: "var(--dashboard-text-secondary)" }}
          >
            {result.solutionSteps.map((step, i) => (
              <li key={i}>
                <RichText text={step} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* 6. Fast method */}
      {result.fastSolvingMethod ? (
        <div className="rounded-lg p-2.5" style={{ background: "var(--dashboard-warning-subtle)" }}>
          <SectionTitle tone="var(--dashboard-warning)" Icon={Lightning}>
            দ্রুত সমাধান · exam shortcut
          </SectionTitle>
          <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
            <RichText text={result.fastSolvingMethod} />
          </p>
        </div>
      ) : null}

      {/* 7. Evidence */}
      <div>
        <SectionTitle Icon={Globe}>প্রমাণ ও উৎস · evidence</SectionTitle>
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <Badge
            tone={
              result.evidence.validatedSourceCount > 0
                ? "var(--dashboard-success)"
                : "var(--dashboard-text-muted)"
            }
          >
            {search.bn}
          </Badge>
          <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">
            {result.evidence.validatedSourceCount} validated source(s)
          </span>
        </div>
        {result.evidence.records.length > 0 ? (
          <ul className="space-y-1.5">
            {result.evidence.records.map((record) => {
              const href = record.url && /^https?:\/\//i.test(record.url) ? record.url : null;
              return (
                <li
                  key={record.id}
                  className="text-[11px] leading-relaxed"
                  style={{ color: "var(--dashboard-text-secondary)" }}
                >
                  <span className="font-mono text-[var(--dashboard-text-muted)]">[{record.id}]</span>{" "}
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline decoration-dotted"
                      style={{ color: "var(--dashboard-primary)" }}
                    >
                      {record.title || record.publisher || href}
                    </a>
                  ) : (
                    <span>{record.title}</span>
                  )}
                  {record.publisher ? (
                    <span className="text-[var(--dashboard-text-muted)]"> · {record.publisher}</span>
                  ) : null}
                  {record.publicationDate ? (
                    <span className="text-[var(--dashboard-text-muted)]"> · {record.publicationDate}</span>
                  ) : null}
                  <span className="text-[var(--dashboard-text-muted)]"> · {record.evidenceType}</span>
                  {record.limitations ? (
                    <span className="block text-[var(--dashboard-text-muted)]">{record.limitations}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
            কোনো যাচাইযোগ্য উৎস পাওয়া যায়নি। এটি কোনো অপশনকে ভুল প্রমাণ করে না।
          </p>
        )}
      </div>

      {/* 8. Limitations */}
      {result.limitations.length > 0 ? (
        <div>
          <SectionTitle tone="var(--dashboard-text-muted)" Icon={Info}>
            সীমাবদ্ধতা · limitations
          </SectionTitle>
          <ul
            className="list-disc list-inside space-y-0.5 text-[11px]"
            style={{ color: "var(--dashboard-text-muted)" }}
          >
            {result.limitations.map((limitation, i) => (
              <li key={i}>
                <RichText text={limitation} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AISourceFooter
        provider={result.metadata?.provider ?? "verified-engine"}
        model={result.metadata?.model ?? undefined}
        latencyMs={result.metadata?.latencyMs}
        toolCount={result.metadata?.searchCalls}
      />
    </div>
  );
}
