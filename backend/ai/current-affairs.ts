// Daily Current Affairs autonomous agent.
//
// Pipeline: Tavily web search (structured REST — the repo deliberately
// avoids the @tavily/core SDK) → Groq structured generation
// (generateObject + Zod) → validated, citation-bound note.
//
// Zero-hallucination guardrail: the model may ONLY compose facts
// from the injected search snippets, and every fact must bind to a
// citation index. Citations whose URL was not returned by the
// search are stripped before persistence — nothing is invented.

import "server-only";

import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";

const TAVILY_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS_PER_QUERY = 6;
const SNIPPET_CHARS = 900;

// Override point: deployments can pin another Groq-hosted model.
const MODEL = process.env.AI_CURRENT_AFFAIRS_MODEL ?? "llama-3.3-70b-versatile";

export type SearchHit = {
  publisher: string;
  articleTitle: string;
  sourceUrl: string;
  publishedAt: string | null;
  snippet: string;
};

// ── Structured Tavily search ────────────────────────────
// Returns typed hits (not an injectable text block) so citations
// can be persisted and cross-checked against model output.
export async function searchNews(query: string): Promise<SearchHit[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 400),
        search_depth: "basic",
        max_results: MAX_RESULTS_PER_QUERY,
        include_answer: false,
      }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
        source?: string;
      }>;
    };

    return (data.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r) => {
        let publisher = (r.source ?? "").trim();
        if (!publisher) {
          try {
            publisher = new URL(r.url!).hostname.replace(/^www\./, "");
          } catch {
            publisher = "Web source";
          }
        }
        return {
          publisher,
          articleTitle: r.title!,
          sourceUrl: r.url!,
          publishedAt: r.published_date ?? null,
          snippet: (r.content ?? "").slice(0, SNIPPET_CHARS),
        } satisfies SearchHit;
      })
      .slice(0, MAX_RESULTS_PER_QUERY);
  } catch {
    return [];
  }
}

// ── Output schema ───────────────────────────────────────
const CitationSchema = z.object({
  publisher: z.string().min(1),
  articleTitle: z.string().min(1),
  sourceUrl: z.string().url(),
  publishedAt: z.string().nullable().optional(),
});

const FactSchema = z.object({
  text: z.string().min(1),
  // 1-based index into the citations array — binds every fact to
  // its original source.
  citation: z.number().int().min(1),
});

const SectionSchema = z.object({
  heading: z.string().min(1),
  facts: z.array(FactSchema).min(1),
});

const McqSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correctOption: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  explanationBn: z.string().min(1),
  relevantExam: z.enum(["BCS", "Bank", "Both"]),
});

export const CurrentAffairsSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(SectionSchema).min(1),
  citations: z.array(CitationSchema).min(1),
  mcqs: z.array(McqSchema).min(5).max(10),
});

export type CurrentAffairsOutput = z.infer<typeof CurrentAffairsSchema>;

// ── System prompt ───────────────────────────────────────
function systemPrompt(dateLabel: string): string {
  return [
    "You are the Daily Current Affairs agent for 9Th-Grade AI, a free exam-prep",
    "platform for Bangladeshi government-job aspirants (BCS, Bangladesh Bank,",
    "Non-Cadre 9th-grade pay-scale posts, Teacher Recruitment).",
    "",
    `Today's date: ${dateLabel}. Produce the current-affairs note for that date.`,
    "",
    "Focus areas: International Affairs, Bangladesh Economy, Government",
    "Policies/Projects, Recent Appointments, Awards, Sports, Science & Tech.",
    "",
    "ZERO-HALLUCINATION RULES (mandatory):",
    "1. Use ONLY facts present in the [WEB n] search snippets below.",
    "2. Every fact MUST carry a `citation` number pointing to the source",
    "   (1-based) whose snippet contains it.",
    "3. NEVER invent names, numbers, dates, or events. If the snippets do",
    "   not contain enough verified facts, say so in fewer facts — do not pad.",
    "4. Citations must be the ACTUAL publisher/article titles/URLs from the",
    "   search results — never fabricated sources.",
    "",
    "Write the note in clear English (the platform renders Bangla UI labels).",
    "MCQs must test the note's facts, each with a plain-English explanation and",
    "a Bangla explanation (explanationBn), tagged relevantExam: BCS, Bank, Both.",
    "Generate 5–10 MCQs. Options arrays must have exactly 4 entries.",
  ].join("\n");
}

function buildGroundingBlock(hits: SearchHit[]): string {
  return hits
    .map(
      (h, i) =>
        `[WEB ${i + 1}] ${h.publisher} — "${h.articleTitle}" (${h.sourceUrl})` +
        (h.publishedAt ? ` · ${h.publishedAt}` : "") +
        `\n${h.snippet}`,
    )
    .join("\n\n");
}

// ── Guardrail enforcement ───────────────────────────────
// Drop facts whose citation index is out of range, and drop
// citations the model invented (URL not present in search hits).
// Re-indexes citations so fact bindings stay correct.
export function enforceGrounding(
  output: CurrentAffairsOutput,
  hits: SearchHit[],
): CurrentAffairsOutput {
  const allowedUrls = new Set(hits.map((h) => h.sourceUrl));

  // Keep only citations that came back from the real search.
  const citationMap = new Map<number, number>(); // old index (1-based) → new
  const citations: CurrentAffairsOutput["citations"] = [];
  output.citations.forEach((c, i) => {
    if (allowedUrls.has(c.sourceUrl)) {
      citationMap.set(i + 1, citations.length + 1);
      citations.push({
        publisher: c.publisher,
        articleTitle: c.articleTitle,
        sourceUrl: c.sourceUrl,
        publishedAt: c.publishedAt ?? null,
      });
    }
  });

  // If the model dropped all real citations (e.g. it fabricated every
  // URL), fall back to the search hits themselves as the citation set
  // so the note stays grounded in real sources.
  if (citations.length === 0) {
    hits.forEach((h, i) => {
      citationMap.set(i + 1, citations.length + 1);
      citations.push({
        publisher: h.publisher,
        articleTitle: h.articleTitle,
        sourceUrl: h.sourceUrl,
        publishedAt: h.publishedAt,
      });
    });
  }

  const maxCitation = citations.length;
  const sections = output.sections
    .map((s) => ({
      heading: s.heading,
      facts: s.facts
        .filter((f) => (citationMap.has(f.citation) ? true : f.citation >= 1 && f.citation <= maxCitation))
        .map((f) => ({
          text: f.text,
          citation: citationMap.get(f.citation) ?? Math.min(f.citation, maxCitation),
        })),
    }))
    .filter((s) => s.facts.length > 0);

  return { ...output, sections, citations };
}

// ── Agent entry point ───────────────────────────────────
export async function generateDailyCurrentAffairs(
  date: Date,
): Promise<CurrentAffairsOutput> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error("GROQ_API_KEY is not configured — the current-affairs agent cannot run.");
  }

  const dateLabel = date.toISOString().slice(0, 10);
  const dayName = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Parallel searches across the exam-relevant beats.
  const queries = [
    `Bangladesh current affairs ${dateLabel} news BCS exam`,
    `Bangladesh economy government policy project ${dateLabel}`,
    `Bangladesh appointments awards sports science tech ${dateLabel}`,
    `international affairs ${dateLabel} Bangladesh impact`,
  ];
  const results = await Promise.all(queries.map((q) => searchNews(q)));
  const hits = results.flat();
  // De-duplicate by URL, keep order.
  const seen = new Set<string>();
  const uniqueHits = hits.filter((h) => {
    if (seen.has(h.sourceUrl)) return false;
    seen.add(h.sourceUrl);
    return true;
  });

  if (uniqueHits.length === 0) {
    throw new Error(
      "TAVILY_API_KEY is not configured or the search returned no results — cannot ground the daily note.",
    );
  }

  const grounding = buildGroundingBlock(uniqueHits);
  const client = createGroq({ apiKey: groqKey });

  const { object } = await generateObject({
    model: client(MODEL),
    schema: CurrentAffairsSchema,
    schemaName: "DailyCurrentAffairs",
    schemaDescription:
      "Daily current-affairs note with source-bound facts and exam MCQs",
    system: systemPrompt(dayName),
    prompt: `Verified search results for ${dateLabel}:\n\n${grounding}\n\nCompose the daily current-affairs note for ${dateLabel}.`,
    temperature: 0.3,
    // Reasoning models (e.g. openai/gpt-oss-*) burn output tokens on
    // hidden reasoning traces, so the budget needs headroom beyond the
    // JSON itself; JSON mode keeps Groq compatibility broad.
    maxTokens: 16_384,
    mode: "json",
  });

  return enforceGrounding(object, uniqueHits);
}
