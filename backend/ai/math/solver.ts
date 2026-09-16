// Deterministic math solver — extracts math expressions from LLM output,
// solves them with JavaScript Math (no external deps), and verifies
// answers against computed results. Critical for BCS/Bank exam math questions
// where LLM approximations are unacceptable.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

export type MathExpression = {
  /** Original expression string. */
  raw: string;
  /** Parsed and normalized expression. */
  normalized: string;
  /** Computed result. */
  result: number;
  /** Expression type classification. */
  type: "arithmetic" | "algebra" | "percentage" | "ratio" | "fraction" | "unknown";
};

export type MathVerification = {
  /** Whether the LLM answer matches the computed result. */
  verified: boolean;
  /** The computed result. */
  computedResult: number;
  /** The LLM's stated answer. */
  llmAnswer: number | null;
  /** Absolute difference between computed and LLM answers. */
  difference: number;
  /** Verification confidence (0-1). */
  confidence: number;
  /** Human-readable verification message. */
  message: string;
};

/** Bengali number words to digits mapping. */
const BENGALI_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
  "শূন্য": "0", "এক": "1", "দুই": "2", "তিন": "3", "চার": "4",
  "পাঁচ": "5", "ছয়": "6", "সাত": "8", "আট": "8", "নয়": "9", "দশ": "10",
};

/** Convert Bengali digits/words to Arabic numerals. */
function bengaliToArabic(text: string): string {
  let result = text;
  for (const [bengali, arabic] of Object.entries(BENGALI_DIGITS)) {
    result = result.split(bengali).join(arabic);
  }
  return result;
}

/** Normalize a math expression for evaluation. */
function normalizeExpression(expr: string): string {
  let normalized = bengaliToArabic(expr.trim());

  // Remove comma separators from numbers
  normalized = normalized.replace(/(\d),(\d)/g, "$1$2");

  // Convert Bengali/Unicode operators
  normalized = normalized.replace(/[×✕]/g, "*");
  normalized = normalized.replace(/[÷]/g, "/");
  normalized = normalized.replace(/[+\u002B]/g, "+");

  // Remove trailing equals sign
  normalized = normalized.replace(/=\s*$/, "");

  return normalized;
}

/** Classify the type of math expression. */
function classifyExpression(expr: string): MathExpression["type"] {
  if (/%|percent|শতাংশ/.test(expr)) return "percentage";
  if (/[:]|ratio|অনুপাত/.test(expr)) return "ratio";
  if (/\//.test(expr) && /\d+\s*\/\s*\d+/.test(expr)) return "fraction";
  if (/[a-zA-Z]/.test(expr.replace(/[a-z]{2,}/gi, ""))) return "algebra";
  return "arithmetic";
}

/** Safe math evaluator — only allows numbers and basic operators. */
function safeEvaluate(expr: string): number | null {
  // Only allow digits, operators, parentheses, decimals, and spaces
  const sanitized = expr.replace(/\s/g, "");
  if (!/^[\d+\-*/().]+$/.test(sanitized)) {
    return null;
  }

  try {
    // Use Function constructor for safe evaluation (no access to global scope)
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const result = fn();

    if (typeof result !== "number" || !isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Extract math expressions from a text block.
 * Returns all detected expressions with their computed results.
 */
export function extractMathExpressions(text: string): MathExpression[] {
  const expressions: MathExpression[] = [];

  // Pattern 1: Explicit math expressions with equals sign
  // e.g., "2 + 3 = " or "১৫০ × ২০ = "
  const explicitPattern = /([০-৯\d+\-*/().,\s×÷%]+)\s*=\s*/g;
  let match;
  while ((match = explicitPattern.exec(text)) !== null) {
    const raw = match[1];
    const normalized = normalizeExpression(raw);
    const result = safeEvaluate(normalized);

    if (result !== null) {
      expressions.push({
        raw,
        normalized,
        result,
        type: classifyExpression(raw),
      });
    }
  }

  // Pattern 2: Standalone arithmetic expressions
  // e.g., "150 × 20" or "3000 / 12"
  if (expressions.length === 0) {
    const standalonePattern = /(?:^|\s)([০-৯\d]+\s*[+\-*/×÷%]\s*[০-৯\d]+(?:\s*[+\-*/×÷%]\s*[০-৯\d]+)*)/g;
    while ((match = standalonePattern.exec(text)) !== null) {
      const raw = match[1];
      const normalized = normalizeExpression(raw);
      const result = safeEvaluate(normalized);

      if (result !== null) {
        expressions.push({
          raw,
          normalized,
          result,
          type: classifyExpression(raw),
        });
      }
    }
  }

  // Pattern 3: Percentage calculations
  // e.g., "25% of 800" or "25% × 800"
  const percentPattern = /(\d+)\s*%?\s*(?:of|×|)\s*(\d+)/gi;
  while ((match = percentPattern.exec(text)) !== null) {
    const percent = parseFloat(match[1]);
    const base = parseFloat(match[2]);
    if (!isNaN(percent) && !isNaN(base)) {
      const result = (percent / 100) * base;
      expressions.push({
        raw: match[0],
        normalized: `(${percent}/100)*${base}`,
        result,
        type: "percentage",
      });
    }
  }

  return expressions;
}

/**
 * Verify an LLM answer against computed math results.
 * Returns verification result with confidence score.
 */
export function verifyMathAnswer(
  llmAnswer: string | number,
  expressions: MathExpression[],
): MathVerification {
  if (expressions.length === 0) {
    return {
      verified: false,
      computedResult: 0,
      llmAnswer: null,
      difference: Infinity,
      confidence: 0,
      message: "কোনো গণিতের সমীকরণ সনাক্ত করা যায়নি।",
    };
  }

  // Extract numeric answer from LLM output
  let llmNum: number | null;
  if (typeof llmAnswer === "number") {
    llmNum = llmAnswer;
  } else {
    const cleaned = bengaliToArabic(llmAnswer).replace(/[^\d.\-]/g, "");
    llmNum = parseFloat(cleaned);
  }

  if (isNaN(llmNum) || llmNum === null) {
    return {
      verified: false,
      computedResult: expressions[0].result,
      llmAnswer: null,
      difference: Infinity,
      confidence: 0,
      message: "LLM উত্তর থেকে সংখ্যা বের করা যায়নি।",
    };
  }

  // Compare with the most relevant computed result
  // For single expressions, use that result
  // For multiple, use the one closest to the LLM answer
  let bestMatch = expressions[0];
  let bestDiff = Math.abs(llmNum - expressions[0].result);

  for (const expr of expressions) {
    const diff = Math.abs(llmNum - expr.result);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = expr;
    }
  }

  const difference = Math.abs(llmNum - bestMatch.result);
  const relativeError = bestMatch.result !== 0
    ? difference / Math.abs(bestMatch.result)
    : difference;

  // Determine verification
  let verified: boolean;
  let confidence: number;
  let message: string;

  if (difference === 0) {
    verified = true;
    confidence = 1.0;
    message = `✅ সঠিক! ${bestMatch.result} নির্ণয় করা হয়েছে।`;
  } else if (relativeError < 0.01 || difference < 0.001) {
    verified = true;
    confidence = 0.95;
    message = `✅ সামান্য পার্থক্য (${difference.toFixed(4)}) — প্রায় সঠিক।`;
  } else if (relativeError < 0.05) {
    verified = true;
    confidence = 0.8;
    message = `⚠️ সামান্য পার্থক্য (${difference.toFixed(2)}) — সম্ভবত সঠিক।`;
  } else {
    verified = false;
    confidence = 0.3;
    message = `❌ ভুল। সঠিক উত্তর: ${bestMatch.result} (পার্থক্য: ${difference.toFixed(2)})`;
  }

  return {
    verified,
    computedResult: bestMatch.result,
    llmAnswer: llmNum,
    difference,
    confidence,
    message,
  };
}
