#!/usr/bin/env tsx
/**
 * AI eval harness — golden-set regression guard.
 *
 * Runs without a database or API key (pure prompt-builders + output validators
 * only, so it is safe in CI and on developer machines). It asserts that every
 * system prompt keeps the required exam guardrails / output-schema anchors and
 * that simulated model outputs pass validation.
 *
 * Live LLM-judge extension: to score real model outputs, run the golden set
 * through the API routes (e.g. POST /api/ai/solver) from a script that runs
 * inside the Next.js server context, then have a second provider call act as
 * the judge. Keeping it behind the server boundary avoids `server-only` imports.
 *
 * Usage: npm run ai:eval   (configured in package.json scripts)
 */

import {
  buildTutorSystem,
  buildSolverSystem,
  buildAssistantSystem,
  buildEvaluatorSystem,
  buildMockTestSystem,
} from "../backend/ai/prompts";
import {
  validateSolverOutput,
  validateEvaluationOutput,
  validateMockTestOutput,
} from "../backend/ai/validation/outputs";
import type { AIContext } from "../backend/ai/types";

const ctx: AIContext = {
  userId: "harness",
  exam: "BCS",
  subject: undefined,
  topic: undefined,
  question: undefined,
  memories: [],
  learningProfile: undefined,
  retrievedKnowledge: undefined,
};

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];
const expect = (name: string, cond: boolean, detail?: string) =>
  checks.push({ name, pass: cond, detail });

// ── Pure prompt-guardrail checks ──────────────────────────────
const tutorPrompt = buildTutorSystem(ctx);
expect("tutor: persona", tutorPrompt.includes("9th-Grade AI"));
expect("tutor: Bangladesh exam context", tutorPrompt.includes("Bangladesh"));

const solverPrompt = buildSolverSystem(ctx);
expect("solver: JSON schema anchor", solverPrompt.includes("solution") && solverPrompt.includes("steps"));

const assistantPrompt = buildAssistantSystem(ctx);
expect("assistant: exam-focused", assistantPrompt.includes("exam-focused"));

const evaluatorPrompt = buildEvaluatorSystem(ctx, "Answer: 42");
expect("evaluator: grading key", evaluatorPrompt.includes("Grading key") && evaluatorPrompt.includes("42"));
expect("evaluator: verdict field", evaluatorPrompt.includes("verdict"));

const mockPrompt = buildMockTestSystem(ctx, { subjectName: "History", exam: "BCS", count: 10 });
expect("mock-test: count + subject", mockPrompt.includes("10") && mockPrompt.includes("History"));

// ── Pure output-validation checks ─────────────────────────────
const solverOut = validateSolverOutput(
  JSON.stringify({ solution: "42", steps: ["a", "b"], explanation: "x" }),
  "fb",
);
expect("solver output: normalized", solverOut.solution === "42" && solverOut.steps.length === 2);

const evalOut = validateEvaluationOutput(JSON.stringify({ score: 85, verdict: "correct" }), "fb");
expect("eval output: verdict inferred", evalOut.verdict === "correct" && evalOut.score === 85);

const mockOut = validateMockTestOutput(
  JSON.stringify({
    title: "T",
    questions: [
      {
        id: "q1",
        question: "Q?",
        options: [
          { id: "A", text: "1" },
          { id: "B", text: "2" },
          { id: "C", text: "3" },
          { id: "D", text: "4" },
        ],
        answer: "A",
        explanation: "1",
        topic: "X",
        difficulty: "EASY",
      },
    ],
  }),
  "fb",
  10,
);
expect("mock output: 4 options", mockOut.questions.length === 1 && mockOut.questions[0].options.length === 4);

// ── Report ───────────────────────────────────────────────────
console.log("\n=== AI Eval Harness (golden-set regression) ===\n");
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
}
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  console.error("FAILED CHECKS:", failed.map((c) => c.name).join(", "));
  process.exit(1);
}
console.log("OK — all golden-set checks passed.");
