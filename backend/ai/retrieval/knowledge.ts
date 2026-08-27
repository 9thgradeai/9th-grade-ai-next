// Domain RAG — grounds the AI in the product's own curated question bank
// (real past/exam questions with verified answers + explanations). This is the
// trust boundary that makes answers accurate and exam-aligned instead of
// hallucinated. Reuses the existing retrieval seam.

import "server-only";

import { prisma } from "~backend/db";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "for", "and", "or",
  "what", "who", "why", "how", "when", "where", "this", "that", "with", "from",
  "theke", "koto", "ki", "ke", "er", "hobe", "hoy", "kemon", "amake", "tumi",
  "এর", "কি", "কে", "এটি", "হল", "কোন", "সাল", "কত", "কী", "এই", "সে", "আর",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export type DomainRetrieval = {
  block: string;
  count: number;
  sources: string[];
};

/**
 * Retrieve the most relevant question-bank entries for a query, scoped to the
 * learner's current subject/topic when available. Scores by keyword overlap
 * (cheap, dependency-free) over a bounded candidate set.
 */
export async function retrieveQuestionBank(params: {
  subjectId?: number;
  topicId?: number;
  query: string;
  limit?: number;
}): Promise<DomainRetrieval> {
  const limit = params.limit ?? 4;
  if (!params.query && !params.subjectId && !params.topicId) {
    return { block: "", count: 0, sources: [] };
  }

  const where: Record<string, unknown> = {};
  if (params.topicId) where.topicId = params.topicId;
  else if (params.subjectId) where.subjectId = params.subjectId;

  const candidates = await prisma.question.findMany({
    where,
    select: {
      id: true,
      topicId: true,
      question: true,
      options: true,
      correctAnswer: true,
      explanation: true,
      topic: true,
      subject: { select: { nameBn: true } },
    },
    take: 60,
  });

  const tokens = tokenize(params.query);
  const scored = candidates
    .map((q) => {
      const hay = `${q.question} ${q.explanation} ${q.topic}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (t.length >= 3 && hay.includes(t)) score += 1;
        else if (t.length < 3 && hay.includes(t)) score += 0.3;
      }
      if (params.topicId && (q as { topicId?: number }).topicId === params.topicId) score += 1.5;
      return { q, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return { block: "", count: 0, sources: [] };

  const lines = scored.map(({ q }, i) => {
    const opts = Array.isArray(q.options) ? (q.options as string[]).join(", ") : "";
    return `Q${i + 1}. ${q.question}\nAnswer: ${q.correctAnswer}\nOptions: ${opts}\nExplanation: ${q.explanation}`;
  });

  return {
    block: lines.join("\n\n"),
    count: scored.length,
    sources: scored.map(({ q }) => `Q${q.id}`),
  };
}
