// Output validation — model output is never trusted blindly. JSON responses
// are parsed and normalized to the expected shape before being returned.

import type { SolverResult } from "../types";

export const MAX_RESPONSE_CHARS = 8_000;

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // Extract the first balanced {...} block as a fallback.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
}

/** Normalize a raw model response into a valid SolverResult. */
export function validateSolverOutput(raw: string, fallback: string): SolverResult {
  const parsed = parseJsonObject(raw);
  const solution = parsed ? asString(parsed.solution, fallback) : fallback;
  const steps = parsed ? asStringArray(parsed.steps) : [];

  return {
    solution: solution.slice(0, MAX_RESPONSE_CHARS),
    steps: steps.slice(0, 20),
    explanation: parsed ? asString(parsed.explanation, "") : undefined,
    relatedConcept: parsed ? asString(parsed.relatedConcept, "") : undefined,
    misconception: parsed ? asString(parsed.misconception, "") : undefined,
    source: "ai",
  };
}

/** Sanitize free-form chat text before returning/persisting. */
export function sanitizeReply(text: string): string {
  return text.trim().slice(0, MAX_RESPONSE_CHARS);
}

export type EvaluationResult = {
  score: number;
  verdict: "correct" | "partial" | "incorrect";
  strengths: string[];
  gaps: string[];
  modelAnswer: string;
  improvementTips: string[];
  source: string;
};

/** Normalize a raw model response into a valid EvaluationResult. */
export function validateEvaluationOutput(raw: string, fallback: string): EvaluationResult {
  const parsed = parseJsonObject(raw);
  const score =
    parsed && typeof parsed.score === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : 0;
  const verdict: EvaluationResult["verdict"] =
    parsed && ["correct", "partial", "incorrect"].includes(parsed.verdict as string)
      ? (parsed.verdict as EvaluationResult["verdict"])
      : score >= 80
        ? "correct"
        : score >= 40
          ? "partial"
          : "incorrect";
  return {
    score,
    verdict,
    strengths: (parsed ? asStringArray(parsed.strengths) : []).slice(0, 5),
    gaps: (parsed ? asStringArray(parsed.gaps) : []).slice(0, 5),
    modelAnswer: parsed ? asString(parsed.modelAnswer, fallback).slice(0, MAX_RESPONSE_CHARS) : fallback,
    improvementTips: (parsed ? asStringArray(parsed.improvementTips) : []).slice(0, 5),
    source: "ai",
  };
}

export type GeneratedMockOption = { id: string; text: string };
export type GeneratedMockQuestion = {
  id: string;
  question: string;
  options: GeneratedMockOption[];
  answer: string;
  explanation: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};
export type GeneratedMockTest = {
  title: string;
  questions: GeneratedMockQuestion[];
  source: string;
};

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

function asDifficulty(value: unknown): GeneratedMockQuestion["difficulty"] {
  return DIFFICULTIES.includes(value as (typeof DIFFICULTIES)[number])
    ? (value as GeneratedMockQuestion["difficulty"])
    : "MEDIUM";
}

/** Normalize a raw model response into a valid GeneratedMockTest. */
export function validateMockTestOutput(raw: string, fallback: string, count = 10): GeneratedMockTest {
  const parsed = parseJsonObject(raw);
  const questions: GeneratedMockQuestion[] = [];
  const rawQuestions = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
  for (const q of rawQuestions) {
    if (typeof q !== "object" || q === null) continue;
    const obj = q as Record<string, unknown>;
    const question = asString(obj.question, "");
    if (!question) continue;
    const options = asStringArrayOfObjects(obj.options).slice(0, 4);
    if (options.length < 2) continue;
    const answer = asString(obj.answer, options[0].id);
    if (!options.some((o) => o.id === answer)) continue;
    questions.push({
      id: asString(obj.id, `q${questions.length + 1}`),
      question,
      options,
      answer,
      explanation: asString(obj.explanation, ""),
      topic: asString(obj.topic, ""),
      difficulty: asDifficulty(obj.difficulty),
    });
  }
  if (questions.length === 0) {
    return { title: "Mock Test", questions: [], source: "ai" };
  }
  return {
    title: parsed ? asString(parsed.title, "AI Mock Test").slice(0, 200) : "AI Mock Test",
    questions: questions.slice(0, Math.max(count, questions.length)),
    source: "ai",
  };
}

function asStringArrayOfObjects(value: unknown): GeneratedMockOption[] {
  if (!Array.isArray(value)) return [];
  const out: GeneratedMockOption[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const id = asString(obj.id, String(out.length + 1));
    const text = asString(obj.text, "");
    if (!text) continue;
    out.push({ id, text });
  }
  return out;
}

export type AdvisorPlan = {
  summary: string;
  recommendedExam: string;
  focusAreas: string[];
  timelineWeeks: number;
  weeklyPlan: { week: number; focus: string; tasks: string[] }[];
  tips: string[];
  source: string;
};

/** Normalize a raw model response into a valid AdvisorPlan. */
export function validateAdvisorOutput(raw: string, fallback: string): AdvisorPlan {
  const parsed = parseJsonObject(raw);
  const plan = parsed && Array.isArray(parsed.weeklyPlan)
    ? (parsed.weeklyPlan as unknown[])
        .map((w) => {
          if (typeof w !== "object" || w === null) return null;
          const obj = w as Record<string, unknown>;
          return {
            week: typeof obj.week === "number" ? obj.week : 0,
            focus: asString(obj.focus, ""),
            tasks: asStringArray(obj.tasks),
          };
        })
        .filter((w): w is { week: number; focus: string; tasks: string[] } => w !== null)
    : [];
  return {
    summary: parsed ? asString(parsed.summary, fallback) : fallback,
    recommendedExam: parsed ? asString(parsed.recommendedExam, "") : "",
    focusAreas: parsed ? asStringArray(parsed.focusAreas) : [],
    timelineWeeks: parsed && typeof parsed.timelineWeeks === "number" ? parsed.timelineWeeks : 12,
    weeklyPlan: plan.slice(0, 12),
    tips: parsed ? asStringArray(parsed.tips) : [],
    source: "ai",
  };
}