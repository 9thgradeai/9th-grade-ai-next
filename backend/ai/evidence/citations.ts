// Evidence and citation system — tracks the provenance of AI claims,
// generates citation blocks for display, and enforces citation requirements
// for high-stakes questions (BCS, Bank exams).

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

/** Source types for citations. */
export type CitationSource =
  | "question_bank"    // From the curated question database
  | "syllabus"         // From the official syllabus
  | "web_search"       // From Tavily web search
  | "news_feed"        // From the news feed
  | "textbook"         // From uploaded textbook content
  | "student_data"     // From the student's own performance data
  | "llm_knowledge";   // From the LLM's internal knowledge (no citation possible)

/** A single citation reference. */
export type Citation = {
  /** Unique citation ID. */
  id: string;
  /** Source type. */
  source: CitationSource;
  /** Human-readable source label. */
  label: string;
  /** Reference ID (question ID, syllabus topic, URL, etc.). */
  referenceId?: string | number;
  /** Reference URL if applicable. */
  url?: string;
  /** Confidence in this citation (0-1). */
  confidence: number;
  /** Excerpt or quote from the source. */
  excerpt?: string;
};

/** An evidence block linking a claim to its citations. */
export type EvidenceBlock = {
  /** The AI claim/statement. */
  claim: string;
  /** Citations supporting this claim. */
  citations: Citation[];
  /** Overall confidence based on citation quality. */
  overallConfidence: number;
};

/** A citation block for display in the UI. */
export type CitationBlock = {
  type: "citation";
  /** The cited claim. */
  claim: string;
  /** Formatted citation text. */
  citationText: string;
  /** Source references for linking. */
  references: Array<{
    id: string;
    label: string;
    url?: string;
  }>;
  /** Confidence indicator. */
  confidence: "high" | "medium" | "low";
};

let citationCounter = 0;

/** Generate a unique citation ID. */
function generateCitationId(): string {
  return `cit_${Date.now()}_${++citationCounter}`;
}

/** Create a citation from a question bank entry. */
export function citeQuestionBank(
  questionId: number,
  questionText: string,
  confidence: number = 0.9,
): Citation {
  return {
    id: generateCitationId(),
    source: "question_bank",
    label: `প্রশ্ন ব্যাংক Q${questionId}`,
    referenceId: questionId,
    confidence,
    excerpt: questionText.slice(0, 200),
  };
}

/** Create a citation from syllabus content. */
export function citeSyllabus(
  topicId: number,
  topicName: string,
  confidence: number = 0.95,
): Citation {
  return {
    id: generateCitationId(),
    source: "syllabus",
    label: `সিলেবাস: ${topicName}`,
    referenceId: topicId,
    confidence,
  };
}

/** Create a citation from web search results. */
export function citeWebSearch(
  url: string,
  title: string,
  confidence: number = 0.7,
): Citation {
  return {
    id: generateCitationId(),
    source: "web_search",
    label: title.slice(0, 100),
    url,
    confidence,
  };
}

/** Create a citation from the news feed. */
export function citeNewsFeed(
  articleId: number,
  title: string,
  confidence: number = 0.8,
): Citation {
  return {
    id: generateCitationId(),
    source: "news_feed",
    label: title.slice(0, 100),
    referenceId: articleId,
    confidence,
  };
}

/** Create a citation from LLM internal knowledge (no verifiable source). */
export function citeLLMKnowledge(
  confidence: number = 0.5,
): Citation {
  return {
    id: generateCitationId(),
    source: "llm_knowledge",
    label: "AI জ্ঞান (যাচাইকৃত নয়)",
    confidence,
  };
}

/**
 * Build an evidence block from a claim and its supporting citations.
 * Calculates overall confidence based on citation quality.
 */
export function buildEvidenceBlock(
  claim: string,
  citations: Citation[],
): EvidenceBlock {
  // Calculate overall confidence
  let overallConfidence: number;
  if (citations.length === 0) {
    overallConfidence = 0.3; // Low confidence without citations
  } else {
    // Weighted average, boosted by multiple independent sources
    const avgConfidence = citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length;
    const sourceTypes = new Set(citations.map((c) => c.source));
    const diversityBonus = Math.min(sourceTypes.size * 0.05, 0.15);
    overallConfidence = Math.min(avgConfidence + diversityBonus, 1.0);
  }

  return {
    claim,
    citations,
    overallConfidence,
  };
}

/**
 * Convert an evidence block to a citation block for UI display.
 */
export function toCitationBlock(evidence: EvidenceBlock): CitationBlock {
  const confidenceLevel: "high" | "medium" | "low" =
    evidence.overallConfidence >= 0.8 ? "high" :
    evidence.overallConfidence >= 0.6 ? "medium" : "low";

  const references = evidence.citations
    .filter((c) => c.referenceId || c.url)
    .map((c) => ({
      id: c.referenceId?.toString() ?? c.id,
      label: c.label,
      url: c.url,
    }));

  const citationParts = evidence.citations.map((c) => `[${c.label}]`);
  const citationText = citationParts.length > 0
    ? `সূত্র: ${citationParts.join(", ")}`
    : "সূত্র: নেই";

  return {
    type: "citation",
    claim: evidence.claim,
    citationText,
    references,
    confidence: confidenceLevel,
  };
}

/**
 * Enforce citation requirements for high-stakes questions.
 * Returns true if the evidence meets the requirements.
 */
export function enforceCitationRequirements(
  evidence: EvidenceBlock,
  isHighStakes: boolean,
): { valid: boolean; reason?: string } {
  if (!isHighStakes) return { valid: true };

  // High-stakes questions require at least one verifiable citation
  const verifiableCitations = evidence.citations.filter(
    (c) => c.source !== "llm_knowledge",
  );

  if (verifiableCitations.length === 0) {
    return {
      valid: false,
      reason: "উচ্চ-ঝুঁকির প্রশ্নের জন্য যাচাইকৃত সূত্র প্রয়োজন।",
    };
  }

  // High-stakes questions require high confidence
  if (evidence.overallConfidence < 0.7) {
    return {
      valid: false,
      reason: "সূত্রের নির্ভরযোগ্যতা পর্যাপ্ত নয়।",
    };
  }

  return { valid: true };
}
