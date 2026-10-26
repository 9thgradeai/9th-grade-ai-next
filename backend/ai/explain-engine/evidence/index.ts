// Evidence retrieval for the verification orchestrator.
//
// Policy:
//   • Pure computation questions skip web search (deterministic reasoning is
//     preferable and avoids irrelevant sources).
//   • Search failures are recorded as operational states — never converted
//     into a claim that an option is wrong.
//   • Result snippets are untrusted data: fenced, defanged, length-capped.
//   • Source URLs are validated syntactically; we never fetch them (SSRF).

import "server-only";

import { aiCacheGet, aiCacheKey, aiCacheSet } from "../../infrastructure/ai-cache";
import { webSearch, type WebSearchResult } from "../../retrieval/web-search";
import { normalizeForComparison, safeExcerpt, neutralizeUntrustedText, looksLikeMath } from "../text";
import type { CanonicalSnapshot } from "../canonical-snapshot";
import {
  EvidenceSchema,
  type Evidence,
  type EvidenceRecord,
  type EvidenceSearchStatus,
  type EvidenceType,
} from "../schema/types";
import { checkSourceUrl, classifySource, publisherFor } from "./url-policy";

const MAX_RECORDS = 6;
const MAX_QUERIES = 2;
const CURRENT_AFFAIRS_TTL_MS = 45 * 60 * 1_000;
const GENERAL_TTL_MS = 6 * 60 * 60 * 1_000;

type CachedSearch = {
  savedAt: string;
  expiresAt: string;
  results: WebSearchResult[];
};

const MATH_SUBJECT = /(math|গণিত|arithmetic|algebra|geometry|probability|calculus|পরিসংখ্যান|বীজগণিত)/i;
const CURRENT_AFFAIRS = /(current affairs|সাম্প্রতিক|চলমান|বিশ্ব|আন্তর্জাতিক)/i;

function isCurrentAffairs(snapshot: CanonicalSnapshot): boolean {
  const haystack = `${snapshot.context.subject ?? ""} ${snapshot.context.topic ?? ""} ${snapshot.context.examType ?? ""}`;
  if (CURRENT_AFFAIRS.test(haystack)) return true;
  const year = snapshot.context.contextYear;
  return year != null && year >= new Date().getUTCFullYear() - 2;
}

function buildQueries(snapshot: CanonicalSnapshot): string[] {
  const cleanQuestion = snapshot.questionText
    .replace(/\s+/g, " ")
    .replace(/\$\$?/g, " ")
    .trim();
  const primary = [cleanQuestion, snapshot.context.subject, snapshot.context.topic]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .slice(0, 380);

  const secondary = [
    snapshot.context.subject,
    snapshot.context.topic,
    "Bangladesh",
    "official",
  ]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .slice(0, 380);

  const queries = [primary];
  if (secondary && normalizeForComparison(secondary) !== normalizeForComparison(primary)) {
    queries.push(secondary);
  }
  return queries.slice(0, MAX_QUERIES);
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return trimmed.slice(0, 40);
}

function makeRecord(
  result: WebSearchResult,
  index: number,
  snapshot: CanonicalSnapshot,
): EvidenceRecord | null {
  const policy = checkSourceUrl(result.url);
  if (!policy.ok) return null;

  const evidenceType: EvidenceType = classifySource(policy.hostname);
  const publicationDate = normalizeDate(result.publishedDate);
  const limitations: string[] = [];

  // Don't apply current information retrospectively to historical questions.
  const contextYear = snapshot.context.contextYear;
  const nowYear = new Date().getUTCFullYear();
  if (contextYear != null && contextYear < nowYear - 2 && publicationDate) {
    const pubYear = Number(publicationDate.slice(0, 4));
    if (Number.isFinite(pubYear) && pubYear > contextYear) {
      limitations.push(
        `Published ${publicationDate}, after the question's ${contextYear} context; not used to override contemporaneous facts.`,
      );
    }
  }

  return {
    id: `e${index + 1}`,
    title: safeExcerpt(result.title || policy.hostname, 400),
    publisher: publisherFor(policy.hostname),
    url: policy.url,
    publicationDate,
    effectiveDate: null,
    accessedAt: new Date().toISOString(),
    excerpt: safeExcerpt(neutralizeUntrustedText(result.content), 1_200) || null,
    claimSupported: null,
    evidenceType,
    supportsOptionIds: [],
    limitations: limitations.length > 0 ? limitations.join(" ") : null,
  };
}

async function cachedSearch(query: string): Promise<WebSearchResult[] | null> {
  const key = aiCacheKey(["evidence-search-v1", normalizeForComparison(query)]);
  const raw = await aiCacheGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedSearch;
    if (!parsed || !Array.isArray(parsed.results)) return null;
    if (typeof parsed.expiresAt !== "string" || Date.parse(parsed.expiresAt) <= Date.now()) {
      return null;
    }
    return parsed.results;
  } catch {
    return null;
  }
}

async function writeCachedSearch(query: string, ttlMs: number, results: WebSearchResult[]): Promise<void> {
  const key = aiCacheKey(["evidence-search-v1", normalizeForComparison(query)]);
  const now = Date.now();
  const payload: CachedSearch = {
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    results,
  };
  await aiCacheSet(key, JSON.stringify(payload));
}

export type EvidenceGatherOptions = {
  enabled?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Test seam: replace network search. */
  searchFn?: typeof webSearch;
};

export async function gatherEvidence(
  snapshot: CanonicalSnapshot,
  opts: EvidenceGatherOptions = {},
): Promise<Evidence> {
  const empty = (status: EvidenceSearchStatus, extra: Partial<Evidence> = {}): Evidence => ({
    searchStatus: status,
    searchPerformed: false,
    searchSuccess: false,
    queries: [],
    records: [],
    sourcesUsed: [],
    conflicting: false,
    conflictDetails: null,
    validatedSourceCount: 0,
    ...extra,
  });

  if (opts.enabled === false) return empty("NOT_ATTEMPTED");

  const mathSubject = MATH_SUBJECT.test(
    `${snapshot.context.subject ?? ""} ${snapshot.context.topic ?? ""}`,
  );
  if (mathSubject && looksLikeMath(snapshot.questionText)) {
    return empty("NOT_ATTEMPTED");
  }

  if (!process.env.TAVILY_API_KEY && !opts.searchFn) return empty("UNAVAILABLE");

  const queries = buildQueries(snapshot);
  const ttlMs = isCurrentAffairs(snapshot) ? CURRENT_AFFAIRS_TTL_MS : GENERAL_TTL_MS;
  const search = opts.searchFn ?? webSearch;

  let status: EvidenceSearchStatus = "LIVE_SEARCH";
  let performed = false;
  let success = false;
  let results: WebSearchResult[] = [];

  for (const query of queries) {
    const cached = await cachedSearch(query);
    if (cached) {
      performed = true;
      success = true;
      status = "CACHED_EVIDENCE";
      results = cached;
      if (cached.length > 0) break;
      continue;
    }

    performed = true;
    const response = await search(query, {
      maxResults: MAX_RECORDS,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    });

    if (!response.ok) {
      return empty("FAILED", { queries, searchPerformed: true, searchSuccess: false });
    }

    success = true;
    status = "LIVE_SEARCH";
    results = response.results;
    if (results.length > 0) {
      await writeCachedSearch(query, ttlMs, results);
      break;
    }
  }

  if (results.length === 0) {
    return empty("NO_RESULTS", {
      queries,
      searchPerformed: performed,
      searchSuccess: success,
    });
  }

  const seen = new Set<string>();
  const records: EvidenceRecord[] = [];
  for (const result of results) {
    if (records.length >= MAX_RECORDS) break;
    const record = makeRecord(result, records.length, snapshot);
    if (!record) continue;
    const dedupeKey = record.url ?? `${record.title}|${record.publisher ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    records.push(record);
  }

  const validatedSourceCount = records.filter((r) => r.url && checkSourceUrl(r.url).ok).length;

  return EvidenceSchema.parse({
    searchStatus: status,
    searchPerformed: performed,
    searchSuccess: success,
    queries,
    records,
    sourcesUsed: records.map((r) => r.id),
    conflicting: false,
    conflictDetails: null,
    validatedSourceCount,
  });
}

/** Keep only evidence IDs that actually exist; report the rest. */
export function validateEvidenceRefs(
  evidence: Evidence,
  claimedIds: readonly string[],
): { validIds: string[]; unknownIds: string[] } {
  const existing = new Set(evidence.records.map((r) => r.id));
  const validIds: string[] = [];
  const unknownIds: string[] = [];
  for (const id of claimedIds) {
    (existing.has(id) ? validIds : unknownIds).push(id);
  }
  return { validIds: Array.from(new Set(validIds)), unknownIds: Array.from(new Set(unknownIds)) };
}
