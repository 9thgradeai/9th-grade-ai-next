/**
 * scripts/import-vocab-from-bcs-english.ts
 * ----------------------------------------------------------------------------
 * Content pipeline (audit §3.2 E): extract vocabulary candidates from the
 * already-imported BCS English question corpus, rank by frequency + exam
 * relevance, and emit a reviewable candidate list. Does NOT write to the DB —
 * output is a JSON proposal for admin review before enrichment.
 *
 * Usage:
 *   npx tsx scripts/import-vocab-from-bcs-english.ts --out /tmp/vocab-candidates.json
 */
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const STOP = new Set([
  "the","a","an","of","to","in","for","on","with","at","by","from","as","is","are","was","were","be","been","being",
  "and","or","but","if","then","that","this","these","those","it","its","he","she","they","we","you","i","me","him","her",
  "us","them","my","your","his","our","their","not","no","yes","do","does","did","have","has","had","will","would",
  "can","could","should","may","might","must","shall","about","into","over","after","before","between","through","during",
  "without","within","upon","up","down","out","off","than","so","such","very","more","most","less","least","only","just",
  "also","too","even","ever","never","always","often","sometimes","here","there","where","when","why","how","what","which",
  "who","whom","whose","all","any","some","each","every","both","few","many","much","other","another","same","own","new",
  "old","first","last","next","long","great","little","own","other","old","right","big","high","different","small","large",
  "young","important","few","public","bad","same","able",
]);

function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z'\- ]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? argv[outIdx + 1] : "/tmp/vocab-candidates.json";

  let corpus: any = null;
  const candidates = ["database/data/question_bank/bcs/bcs_questions.json", "database/data/question_bank/bcs/bcs_docx_papers.json"];
  const freq = new Map<string, { count: number; samples: Set<string> }>();
  for (const c of candidates) {
    try {
      const data = JSON.parse(readFileSync(join(process.cwd(), c), "utf8"));
      const arr = Array.isArray(data) ? data : data.questions ?? [];
      for (const q of arr) {
        const text = [q.question, q.explanation, ...(q.options ?? [])].join(" ");
        for (const t of tokens(text)) {
          const e = freq.get(t) ?? { count: 0, samples: new Set() };
          e.count++;
          if (e.samples.size < 3) e.samples.add(String(q.question ?? "").slice(0, 80));
          freq.set(t, e);
        }
      }
    } catch {
      // skip missing
    }
  }

  const list = [...freq.entries()]
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 500)
    .map(([word, v]) => ({
      word,
      frequency: v.count,
      samples: [...v.samples],
      suggestedExamRelevance: ["BCS"],
      status: "pending-review",
    }));

  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), total: list.length, candidates: list }, null, 2), "utf8");
  console.log(`Wrote ${list.length} candidates to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
