// Verification pipeline — combines math verification, citation checking,
// hallucination detection, and fact-checking against the question bank.
// Returns a comprehensive verification result with actionable feedback.

import "server-only";

import { extractMathExpressions, verifyMathAnswer, type MathVerification } from "../math/solver";
import { enforceCitationRequirements, type EvidenceBlock } from "../evidence/citations";
import { log } from "~backend/infrastructure/observability/logger";

export type VerificationInput = {
  /** The AI's response text. */
  responseText: string;
  /** The original user query. */
  query: string;
  /** Evidence blocks attached to the response. */
  evidence?: EvidenceBlock[];
  /** Whether this is a high-stakes question (BCS, Bank, etc.). */
  isHighStakes?: boolean;
  /** Known correct answer from the question bank (if available). */
  knownAnswer?: string;
};

export type VerificationResult = {
  /** Overall verification status. */
  status: "passed" | "warning" | "failed";
  /** Overall confidence (0-1). */
  confidence: number;
  /** Math verification result (if math detected). */
  mathVerification?: MathVerification;
  /** Citation verification result. */
  citationVerification: {
    valid: boolean;
    reason?: string;
  };
  /** Hallucination detection result. */
  hallucinationCheck: {
    detected: boolean;
    indicators: string[];
  };
  /** Fact-check result against question bank. */
  factCheck?: {
    matched: boolean;
    questionId?: number;
    correctAnswer?: string;
  };
  /** Human-readable summary. */
  summary: string;
  /** Suggested corrections (if any). */
  corrections?: string[];
};

/**
 * Run the full verification pipeline on an AI response.
 */
export async function verifyResponse(input: VerificationInput): Promise<VerificationResult> {
  const { responseText, query, evidence, isHighStakes, knownAnswer } = input;

  const corrections: string[] = [];
  let overallConfidence = 1.0;
  let status: VerificationResult["status"] = "passed";

  // ── 1. Math verification ──────────────────────────────────

  let mathVerification: MathVerification | undefined;
  const mathExpressions = extractMathExpressions(responseText);

  if (mathExpressions.length > 0) {
    // Find the answer in the response (look for numbers after equals or at the end)
    const answerMatch = responseText.match(/(?:=|উত্তর|ans(?:wer)?)\s*([০-৯\d.,]+)/i);
    const llmAnswer = answerMatch?.[1] ?? responseText;

    mathVerification = verifyMathAnswer(llmAnswer, mathExpressions);

    if (!mathVerification.verified) {
      status = "warning";
      overallConfidence *= 0.7;
      corrections.push(`গণিত: ${mathVerification.message}`);
    }
  }

  // ── 2. Citation verification ──────────────────────────────

  let citationVerification = { valid: true, reason: undefined as string | undefined };

  if (evidence && evidence.length > 0) {
    for (const ev of evidence) {
      const check = enforceCitationRequirements(ev, isHighStakes ?? false);
      if (!check.valid) {
        citationVerification = { valid: false, reason: check.reason };
        status = "warning";
        overallConfidence *= 0.8;
        corrections.push(`সূত্র: ${check.reason}`);
      }
    }
  } else if (isHighStakes) {
    citationVerification = {
      valid: false,
      reason: "উচ্চ-ঝুঁকির প্রশ্নের জন্য সূত্র প্রয়োজন।",
    };
    status = "warning";
    overallConfidence *= 0.8;
  }

  // ── 3. Hallucination detection ────────────────────────────

  const hallucinationCheck = detectHallucination(responseText, query);

  if (hallucinationCheck.detected) {
    status = "warning";
    overallConfidence *= 0.6;
    corrections.push(`সম্ভাব্য ভুল তথ্য: ${hallucinationCheck.indicators.join(", ")}`);
  }

  // ── 4. Fact-check against question bank ───────────────────

  let factCheck: VerificationResult["factCheck"];

  if (knownAnswer) {
    // Compare the AI's answer with the known correct answer
    const aiAnswer = extractMainAnswer(responseText);
    const normalizedAI = normalizeAnswer(aiAnswer);
    const normalizedKnown = normalizeAnswer(knownAnswer);

    factCheck = {
      matched: normalizedAI === normalizedKnown,
      correctAnswer: knownAnswer,
    };

    if (!factCheck.matched) {
      status = "failed";
      overallConfidence *= 0.3;
      corrections.push(`ভুল উত্তর। সঠিক উত্তর: ${knownAnswer}`);
    }
  }

  // ── 5. Generate summary ───────────────────────────────────

  const summary = generateSummary(status, corrections);

  return {
    status,
    confidence: Math.max(overallConfidence, 0),
    mathVerification,
    citationVerification,
    hallucinationCheck,
    factCheck,
    summary,
    corrections: corrections.length > 0 ? corrections : undefined,
  };
}

/**
 * Simple hallucination detection — looks for common patterns
 * that indicate the LLM might be making things up.
 */
function detectHallucination(text: string, query: string): {
  detected: boolean;
  indicators: string[];
} {
  const indicators: string[] = [];

  // Check for overly specific numbers without context
  const specificNumbers = text.match(/\b\d{4,}\b/g);
  if (specificNumbers && specificNumbers.length > 3) {
    indicators.push("অনেক নির্দিষ্ট সংখ্যা ছাড়া প্রসঙ্গ");
  }

  // Check for claims about the query topic that aren't supported
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const responseWords = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const overlap = Array.from(queryWords).filter((w) => responseWords.has(w)).length;
  const overlapRatio = queryWords.size > 0 ? overlap / queryWords.size : 1;

  if (overlapRatio < 0.1 && queryWords.size > 3) {
    indicators.push("প্রশ্নের সাথে খুব কম সম্পর্ক");
  }

  // Check for hedging language that might indicate uncertainty
  const hedging = ["হতে পারে", "সম্ভবত", "মনে হচ্ছে", "perhaps", "maybe", "possibly"];
  const hasHedging = hedging.some((h) => text.toLowerCase().includes(h));
  if (hasHedging) {
    indicators.push("অনিশ্চিত ভাষা ব্যবহার");
  }

  return {
    detected: indicators.length >= 2,
    indicators,
  };
}

/** Extract the main answer from a response text. */
function extractMainAnswer(text: string): string {
  // Look for answer after common markers
  const markers = ["=", "উত্তর", "answer", "ans", "=>", "->"];
  for (const marker of markers) {
    const idx = text.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (idx !== -1) {
      return text.slice(idx + marker.length).trim();
    }
  }
  // Return the last line as a fallback
  const lines = text.trim().split("\n");
  return lines[lines.length - 1].trim();
}

/** Normalize an answer for comparison. */
function normalizeAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .replace(/[^\d]/g, "") // Keep only digits
    .trim();
}

/** Generate a human-readable summary. */
function generateSummary(status: VerificationResult["status"], corrections: string[]): string {
  switch (status) {
    case "passed":
      return "✅ যাচাই সফল — উত্তর সঠিক মনে হচ্ছে।";
    case "warning":
      return `⚠️ সতর্কতা — ${corrections.length}টি সমস্যা সনাক্ত করা হয়েছে।`;
    case "failed":
      return `❌ যাচাই ব্যর্থ — ${corrections.length}টি গুরুতর সমস্যা।`;
  }
}
