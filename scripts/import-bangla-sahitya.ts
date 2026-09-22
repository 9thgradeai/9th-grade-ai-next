/**
 * scripts/import-bangla-sahitya.ts
 * ----------------------------------------------------------------------------
 * One-shot migration: normalizes the 11 raw Bangla-সাহিত্য MCQ dumps under
 *   database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/
 * into seed-compatible single-line records and reorganizes them into exact
 * taxonomy leaf folders (Tier_* authors, চর্যাপদ sub-leaves, মধ্যযুগ leaves).
 *
 * Raw formats handled:
 *   - single-line "ক. … খ. … গ. … ঘ. … Ans./উত্তর: … ব্যাখ্যা: …"
 *   - multi-line records with "ক) খ) গ) ঘ)" markers + "উত্তর:" answers
 *   - "সাবটপিক:" section headers inside মধ্যযুগ/মধ্যযুগ.txt
 *
 * After running, execute: npx tsx scripts/seed-questions.ts
 * ----------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const SAHITYA = join(
  process.cwd(),
  "database",
  "data",
  "ques",
  "বাংলা ভাষা ও সাহিত্য",
  "সাহিত্য",
);
const ADHUNIK = join(SAHITYA, "আধুনিক_যুগ_১৮০০_হতে_বর্তমান");
const PRACHIN = join(SAHITYA, "প্রাচীন_যুগ");
const MODHYO = join(SAHITYA, "মধ্যযুগ");

// filename (underscores→spaces, NFC) → [tierFolder, authorLeaf]
const AUTHOR_MAP: Array<{ match: string; tier: string; leaf: string }> = [
  { match: "রবীন্দ্রনাথ ঠাকুর", tier: "Tier_01_মাস্টার_হট_স্পট", leaf: "01_রবীন্দ্রনাথ_ঠাকুর" },
  { match: "কাজী নজরুল ইসলাম", tier: "Tier_01_মাস্টার_হট_স্পট", leaf: "02_কাজী_নজরুল_ইসলাম" },
  { match: "জসীমউদ্দীন", tier: "Tier_02_ভেরি_হাই_ইল্ড", leaf: "03_জসীমউদ্দীন" },
  { match: "মাইকেল মধুসূদন দত্ত", tier: "Tier_02_ভেরি_হাই_ইল্ড", leaf: "05_মাইকেল_মধুসূদন_দত্ত" },
  { match: "শরৎচন্দ্র", tier: "Tier_02_ভেরি_হাই_ইল্ড", leaf: "06_শরৎচন্দ্র_চট্টোপাধ্যায়" },
  { match: "মীর মশাররফ হোসেন", tier: "Tier_02_ভেরি_হাই_ইল্ড", leaf: "07_মীর_মশাররফ_হোসেন" },
  { match: "জীবনানন্দ", tier: "Tier_02_ভেরি_হাই_ইল্ড", leaf: "08_জীবনানন্দ_দাস" },
  { match: "রোকেয়া", tier: "Tier_03_ফোকাসড_লেখক", leaf: "12_বেগম_রোকেয়া_সাখাওয়াত_হোসেন" },
  { match: "বিদ্যাসাগর", tier: "Tier_03_ফোকাসড_লেখক", leaf: "13_ঈশ্বরচন্দ্র_বিদ্যাসাগর" },
];

// ── Record splitting ────────────────────────────────────────────────────────
// A record starts with a Bengali/Latin number + "." at line start.
const REC_START = /^\s*[০-৯0-9]+\s*\.\s*/;
const SUBTOPIC = /^\s*সাবটপিক\s*:\s*(.+?)\s*$/;

function splitRecords(text: string): Array<{ subtopic: string | null; lines: string[] }> {
  const out: Array<{ subtopic: string | null; lines: string[] }> = [];
  let current: string[] | null = null;
  let subtopic: string | null = null;
  const flush = () => {
    if (current && current.length > 0) out.push({ subtopic, lines: current });
    current = null;
  };
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const st = line.match(SUBTOPIC);
    if (st) {
      flush();
      subtopic = st[1].trim();
      continue;
    }
    if (REC_START.test(line)) {
      flush();
      current = [line];
    } else if (current) {
      current.push(line);
    }
    // lines before the first record (titles etc.) are ignored
  }
  flush();
  return out;
}

// ── Record normalization ────────────────────────────────────────────────────
// Joins multi-line records and converts "ক) খ) গ) ঘ)" → "ক. খ. গ. ঘ." so the
// result matches the seed-questions.ts single-line contract.
function normalizeRecord(lines: string[]): string | null {
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  // Split off explanation first (it may contain marker-like text).
  const explIdx = joined.search(/ব্যাখ্যা\s*:/);
  let head = joined;
  let expl = "";
  if (explIdx >= 0) {
    expl = joined.slice(explIdx).replace(/^ব্যাখ্যা\s*:\s*/, "").trim();
    head = joined.slice(0, explIdx).trim();
  }
  // Split off the answer marker.
  const ansM = head.match(/(উত্তর\s*:|Ans\.\s*|Answer\s*:)/i);
  if (!ansM || ansM.index === undefined) return null;
  const answerRaw = head
    .slice(ansM.index + ansM[0].length)
    .trim()
    .replace(/^([কখগঘ])\s*\)/, "$1.")
    .replace(/\s+/g, " ");
  const qAndOpts = head.slice(0, ansM.index).trim();

  // Locate the four option markers (either "." or ")" style).
  const markerRe = /([কখগঘ])\s*[.)]\s*/g;
  const marks: Array<{ letter: string; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(qAndOpts)) !== null) {
    marks.push({ letter: m[1], index: m.index, end: m.index + m[0].length });
  }
  // Need exactly ক খ গ ঘ in order.
  const want = ["ক", "খ", "গ", "ঘ"];
  const seq = marks.map((x) => x.letter).join("");
  if (seq !== want.join("")) return null;

  const q = qAndOpts.slice(0, marks[0].index).replace(REC_START, "").trim();
  const opts = marks.map((mk, i) =>
    (i + 1 < marks.length ? qAndOpts.slice(mk.end, marks[i + 1].index) : qAndOpts.slice(mk.end)).trim(),
  );
  if (!q || opts.some((o) => !o)) return null;
  return `${q} ক. ${opts[0]} খ. ${opts[1]} গ. ${opts[2]} ঘ. ${opts[3]} উত্তর: ${answerRaw} ব্যাখ্যা: ${expl}`;
}

// ── Sub-leaf routing ────────────────────────────────────────────────────────
function routeCharya(line: string): string {
  if (/পদকর্তা|টীকা|মুনিদত্ত|রচয়িতা|রচনা করেছেন|কবি|পদটি কার|কার রচনা|কতজন|কতটি পদ|নং পদ|রাগের ব্যবহার|প্রবাদবাক্যটি|পদটির/.test(line))
    return "পদকর্তা_ও_টীকাকার";
  if (/ভাষা|ছন্দ|রাগ|প্রবাদ|রূপক|সমাজ|ধর্মতত্ত্ব|দর্শন|সাহিত্যমূল্য|গুরুত্ব|নারী|পেশা|অলংকার|বাদ্যযন্ত্র|বিবাহ|যৌতুক|ধর্ম/.test(line))
    return "ভাষা_ও_সাহিত্যমূল্য";
  return "আবিষ্কার_ও_ইতিহাস";
}

const MODHYO_SECTIONS: Array<{ match: RegExp; leaf: string }> = [
  { match: /শ্রীকৃষ্ণকীর্তন|চণ্ডীদাস/, leaf: "শ্রীকৃষ্ণকীর্তন_ও_বড়ু_চণ্ডীদাস" },
  { match: /মঙ্গলকাব্য/, leaf: "মঙ্গলকাব্যের_ধারা" },
  { match: /বৈষ্ণব/, leaf: "বৈষ্ণব_পদাবলী" },
  { match: /শাক্ত/, leaf: "শাক্ত_পদাবলী" },
  { match: /অনুবাদ/, leaf: "অনুবাদ_সাহিত্য" },
  { match: /রোমান্টিক|প্রণয়োপাখ্যান/, leaf: "রোমান্টিক_প্রণয়োপাখ্যান" },
  { match: /সৈয়দ সুলতান|নাথ সাহিত্য/, leaf: "মীর_সৈয়দ_সুলতান_ও_নাথ_সাহিত্য" },
  { match: /পুথি|লোকসাহিত্য/, leaf: "পুথি_সাহিত্য_ও_লোকসাহিত্য" },
];

function routeModhyo(subtopic: string | null, line: string): string {
  if (subtopic) {
    for (const s of MODHYO_SECTIONS) if (s.match.test(subtopic)) return s.leaf;
  }
  return "অন্ধকার_যুগ_১২০০_১৩৫০";
}

// মঙ্গল/অনুবাদ/রোমান্টিক parents split further into children by keyword.
function refineModhyo(leaf: string, line: string): string {
  if (leaf === "মঙ্গলকাব্যের_ধারা") {
    if (/মনসা|বিজয়গুপ্ত|চাঁদ সওদাগর|বেহুলা|লখিন্দর|পদ্মপুরাণ|কানাহরি|বিপ্রদাস|নারায়ণ দেব|কেতকাদাস/.test(line)) return "মনসামঙ্গল";
    if (/চণ্ডী|মুকুন্দরাম|কালকেতু|ফুল্লরা|ধনপতি|খুল্লনা|শ্রীমন্ত|কবিকঙ্কণ|বারোমাস্যা|মাণিক দত্ত|অভয়ামঙ্গল/.test(line)) return "চণ্ডীমঙ্গল";
    if (/ধর্মমঙ্গল|ঘনরাম|ময়ূর ভট্ট|রূপরাম|অনাদিমঙ্গল|রাঢ়|ধর্মঠাকুর|লাউসেন/.test(line)) return "ধর্মমঙ্গল";
  }
  if (leaf === "অনুবাদ_সাহিত্য") {
    if (/রামায়ণ|রামায়ণ|কৃত্তিবাস|কর্ত্তিবাস/.test(line)) return "রামায়ণী_সাহিত্য_কর্ত্তিবাসী";
    if (/মহাভারত|কাশীরাম|কাশীদাস/.test(line)) return "মহাভারতের_অনুবাদ_কাশীরাম_দাস";
  }
  if (leaf === "রোমান্টিক_প্রণয়োপাখ্যান") {
    if (/ইউসুফ|জুলেখা|সগীর/.test(line)) return "ইউসুফ_জুলেখা_শাহ_মুহম্মদ_সগীর";
    if (/লয়লা|মজনু/.test(line)) return "লয়লা_মজনু_ও_সৈয়দ_সুলতান";
  }
  return leaf;
}

function writeLeaf(dirs: string[], filename: string, lines: string[]): void {
  const dir = join(...dirs);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), `${lines.join("\n")}\n`, "utf8");
}

function main(): void {
  const report: Array<{ target: string; count: number }> = [];
  let skipped = 0;

  // ── 1. আধুনিক author files → Tier/author leaves ──
  for (const entry of readdirSync(ADHUNIK, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.txt$/i.test(entry.name)) continue;
    const norm = entry.name.normalize("NFC").replace(/_/g, " ");
    const hit = AUTHOR_MAP.find((a) => norm.includes(a.match.normalize("NFC")));
    if (!hit) {
      console.warn(`⚠ No Tier mapping for author file: "${entry.name}" — left in place`);
      continue;
    }
    const text = readFileSync(join(ADHUNIK, entry.name), "utf8");
    const recs = splitRecords(text);
    const good: string[] = [];
    for (const r of recs) {
      const n = normalizeRecord(r.lines);
      if (n) good.push(n);
      else skipped += 1;
    }
    writeLeaf([ADHUNIK, hit.tier, hit.leaf], `Questions_${hit.leaf}.txt`, good);
    rmSync(join(ADHUNIK, entry.name));
    report.push({ target: `${hit.tier}/${hit.leaf}`, count: good.length });
  }

  // ── 2. প্রাচীন চর্যাপদ.txt → চর্যাপদ sub-leaves ──
  const charyaFile = join(PRACHIN, "চর্যাপদ.txt");
  if (existsSync(charyaFile)) {
    const buckets = new Map<string, string[]>();
    for (const r of splitRecords(readFileSync(charyaFile, "utf8"))) {
      const n = normalizeRecord(r.lines);
      if (!n) {
        skipped += 1;
        continue;
      }
      const leaf = routeCharya(n);
      if (!buckets.has(leaf)) buckets.set(leaf, []);
      buckets.get(leaf)!.push(n);
    }
    for (const [leaf, lines] of buckets) {
      writeLeaf([PRACHIN, "চর্যাপদ", leaf], `Questions_${leaf}.txt`, lines);
      report.push({ target: `প্রাচীন_যুগ/চর্যাপদ/${leaf}`, count: lines.length });
    }
    rmSync(charyaFile);
  }

  // ── 3. মধ্যযুগ.txt → মধ্যযুগ leaves ──
  const modhyoFile = join(MODHYO, "মধ্যযুগ.txt");
  if (existsSync(modhyoFile)) {
    const buckets = new Map<string, { segs: string[]; lines: string[] }>();
    for (const r of splitRecords(readFileSync(modhyoFile, "utf8"))) {
      const n = normalizeRecord(r.lines);
      if (!n) {
        skipped += 1;
        continue;
      }
      const parent = routeModhyo(r.subtopic, n);
      const leaf = refineModhyo(parent, n);
      // Child leaves nest under their parent; top-level leaves sit under মধ্যযুগ/.
      const segs =
        leaf !== parent
          ? [MODHYO, parent, leaf]
          : [MODHYO, leaf];
      const key = segs.join("\u0000");
      if (!buckets.has(key)) buckets.set(key, { segs, lines: [] });
      buckets.get(key)!.lines.push(n);
    }
    for (const { segs, lines } of buckets.values()) {
      const leafName = segs[segs.length - 1];
      writeLeaf(segs, `Questions_${leafName}.txt`, lines);
      report.push({ target: segs.join("/").replace(`${MODHYO}/`, "মধ্যযুগ/"), count: lines.length });
    }
    rmSync(modhyoFile);
  }

  console.log("✓ Bangla সাহিত্য reorganization complete:");
  for (const r of report) console.log(`  ${r.target}: ${r.count} questions`);
  const total = report.reduce((a, r) => a + r.count, 0);
  console.log(`  TOTAL: ${total} normalized questions`);
  if (skipped > 0) console.warn(`  ⚠ ${skipped} record(s) could not be normalized (skipped)`);
  console.log("\nNext: npx tsx scripts/seed-questions.ts");
}

main();
