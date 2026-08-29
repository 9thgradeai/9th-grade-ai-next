// scripts/warm-ai-cache.ts — Pre-populate AI response cache with common queries.
// Run on deploy/startup to warm the cache for frequently asked questions.
// This reduces latency and API costs for the most common solver queries.

import "server-only";

import { PrismaClient } from "@prisma/client";
import { aiCacheGet, aiCacheSet, aiCacheKey } from "~backend/ai/infrastructure/ai-cache";
import { solveQuestion } from "~backend/ai/application/services";
import { buildContext } from "~backend/ai/context/context-engine";

const prisma = new PrismaClient();

// Common BCS/Bank exam questions that aspirants frequently ask
// These are pre-computed and cached so subsequent requests hit the cache
const COMMON_QUERIES = [
  // BCS General Knowledge
  { query: "বাংলাদেশের সংবিধানের মূল বৈশিষ্ট্যগুলো কী?", subject: "বাংলাদেশ বিষয়াবলি" },
  { query: "বিসিএস পরীক্ষার সিলেবাস কী?", subject: "বাংলাদেশ বিষয়াবলি" },
  { query: "১৯৭১ সালের মুক্তিযুদ্ধের কারণ ও ফলাফল", subject: "বাংলাদেশ বিষয়াবলি" },
  { query: "বাংলাদেশেরATURE ও পরিবেশ সম্পর্কিত প্রশ্ন", subject: "বাংলাদেশ বিষয়াবলি" },

  // English
  { query: "What is the difference between 'affect' and 'effect'?", subject: "English" },
  { query: "Explain the use of 'have been' vs 'has been'", subject: "English" },
  { query: "Change to passive voice: 'They are building a new school.'", subject: "English" },

  // Mathematics
  { query: "দুটি সংখ্যার যোগফল ২০ এবং গুণফল ৯৬। সংখ্যাগুলো কী?", subject: "গাণিতিক যুক্তি" },
  { query: "Find the LCM of 12, 15, and 20", subject: "গাণিতিক যুক্তি" },
  { query: "সাধারণ বেজোড় সংখ্যা ১১, ১৩, ১৫, ১৭, ১৯ কত?", subject: "গাণিতিক যুক্তি" },

  // General Science
  { query: "পানি কীอ에서 অক্সিজেন ও হাইড্রোজেনের অনুপাত?", subject: "সাধারণ বিজ্ঞান" },
  { query: "বিটামিন ডি এর ফাংশন ও উৎস", subject: "সাধারণ বিজ্ঞান" },
  { query: "প্লাংকের কোস্ট্যান্ট কত?", subject: "সাধারণ বিজ্ঞান" },

  // ICT
  { query: "IPv4 vs IPv6 পার্থক্য ব্যাখ্যা করুন", subject: "তথ্য ও যোগাযোগ প্রযুক্তি" },
  { query: "What is the difference between RAM and ROM?", subject: "তথ্য ও যোগাযোগ প্রযুক্তি" },
  { query: "বাইনারি থেকে ডেসিমেল কনভারশন", subject: "তথ্য ও যোগাযোগ প্রযুক্তি" },

  // Bangladesh Affairs
  { query: "বাংলাদেশের ৮টি বিভাগ ও তাদের রাজধানীর নাম", subject: "বাংলাদেশ বিষয়াবলি" },
  { query: "জাতীয় প্রতীকগুলো কী কী?", subject: "বাংলাদেশ বিষয়াবলি" },
];

interface WarmResult {
  query: string;
  subject: string;
  cached: boolean;
  error?: string;
}

async function warmCache(): Promise<WarmResult[]> {
  const results: WarmResult[] = [];
  const dummyUserId = "cache-warmup"; // Use a dummy user ID for cache warming

  console.log("🔥 Starting AI cache warmup...");

  for (const { query, subject } of COMMON_QUERIES) {
    try {
      // Check if already cached
      const context = await buildContext({
        userId: dummyUserId,
        task: "solver",
      });

      // Get subject ID
      const subjectRow = await prisma.subject.findFirst({
        where: { nameBn: subject },
        select: { id: true },
      });

      const cacheKey = aiCacheKey(["solver", dummyUserId, query, subjectRow?.id?.toString() ?? ""]);
      const existing = await aiCacheGet(cacheKey);

      if (existing) {
        results.push({ query, subject, cached: true });
        console.log(`  ✓ Already cached: ${query.slice(0, 50)}...`);
        continue;
      }

      // Generate and cache the response
      console.log(`  ⏳ Generating: ${query.slice(0, 50)}...`);
      const result = await solveQuestion({
        userId: dummyUserId,
        request: { text: query, subjectId: subjectRow?.id },
      });

      // The solveQuestion function already caches the response internally
      // Just verify it was cached
      const cached = await aiCacheGet(cacheKey);
      results.push({ query, subject, cached: !!cached });

      if (cached) {
        console.log(`  ✅ Cached: ${query.slice(0, 50)}...`);
      } else {
        console.log(`  ⚠️  Cache miss after generation: ${query.slice(0, 50)}...`);
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ query, subject, cached: false, error: msg });
      console.error(`  ❌ Failed: ${query.slice(0, 50)}... — ${msg}`);
    }
  }

  return results;
}

// Run if executed directly
if (require.main === module) {
  warmCache()
    .then((results) => {
      const success = results.filter((r) => r.cached).length;
      const failed = results.filter((r) => r.error).length;
      console.log(`\n📊 Cache warmup complete: ${success}/${results.length} cached, ${failed} failed`);
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Cache warmup failed:", err);
      process.exit(1);
    });
}

export { warmCache, COMMON_QUERIES };