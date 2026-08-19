/**
 * scripts/taxonomy.ts
 * ----------------------------------------------------------------------------
 * Canonical question-bank taxonomy (the "permanent architecture").
 *
 * The tree is stored in database/data/taxonomy.json. This module loads that
 * JSON and exposes helpers used by the seeder (scripts/seed-questions.ts and
 * database/prisma/seed.ts) to:
 *
 *   • create the recursive Topic tree in the database, and
 *   • resolve local folder names (database/data/ques/<Subject>/<Node>/…/*.txt)
 *     to taxonomy nodes by NFC-normalised name.
 *
 * It is deliberately free of "server-only" so both tsx scripts and Next.js
 * server code can import it. The runtime source of truth for the dashboard is
 * the Topic table; this JSON is the seed-time contract for content layout.
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";

export type TaxonomyNode = {
  name: string;
  path: string; // absolute path from root, e.g. "/04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা"
  depth: number; // subject = 1
  children: TaxonomyNode[];
  leaf?: boolean;
};

export function loadTaxonomy(): TaxonomyNode {
  const file = join(process.cwd(), "database", "data", "taxonomy.json");
  return JSON.parse(readFileSync(file, "utf8")) as TaxonomyNode;
}

export function flattenTaxonomy(root: TaxonomyNode): TaxonomyNode[] {
  const out: TaxonomyNode[] = [];
  const walk = (n: TaxonomyNode) => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

// Canonical subject metadata in architecture (syllabus) order. `architectureName`
// is the taxonomy root segment; `nameBn`/`nameEn` are the display names used
// across the dashboard (Question Bank filter, subject cards, exam builder).
export type SubjectMeta = {
  nameBn: string;
  nameEn: string;
  architectureName: string;
  icon: string;
  color: string;
  bg: string;
};

export const SUBJECT_META: SubjectMeta[] = [
  { nameBn: "বাংলা ভাষা ও সাহিত্য", nameEn: "Bangla Language & Literature", architectureName: "01_বাংলা_ভাষা_ও_সাহিত্য", icon: "📖", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { nameBn: "English Language and Literature", nameEn: "English Language and Literature", architectureName: "02_English_Language_and_Literature", icon: "📚", color: "text-sky-400", bg: "bg-sky-500/10" },
  { nameBn: "বাংলাদেশ বিষয়াবলি", nameEn: "Bangladesh Affairs", architectureName: "03_বাংলাদেশ_বিষয়াবলি", icon: "🇧🇩", color: "text-green-400", bg: "bg-green-500/10" },
  { nameBn: "আন্তর্জাতিক বিষয়াবলী", nameEn: "International Affairs", architectureName: "04_আন্তর্জাতিক_বিষয়াবলি", icon: "🌍", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { nameBn: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা", nameEn: "Geography, Environment & Disaster Management", architectureName: "05_ভূগোল_পরিবেশ_ও_দুর্যোগ_ব্যবস্থাপনা", icon: "🗺️", color: "text-teal-400", bg: "bg-teal-500/10" },
  { nameBn: "সাধারণ বিজ্ঞান", nameEn: "General Science", architectureName: "06_সাধারণ_বিজ্ঞান", icon: "🔬", color: "text-purple-400", bg: "bg-purple-500/10" },
  { nameBn: "কম্পিউটার ও তথ্য প্রযুক্তি", nameEn: "Computer & IT", architectureName: "07_কম্পিউটার_ও_তথ্য_প্রযুক্তি", icon: "💻", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { nameBn: "গাণিতিক যুক্তি", nameEn: "Mathematical Reasoning", architectureName: "08_গাণিতিক_যুক্তি", icon: "🧮", color: "text-amber-400", bg: "bg-amber-500/10" },
  { nameBn: "মানসিক দক্ষতা", nameEn: "Mental Ability", architectureName: "09_মানসিক_দক্ষতা", icon: "🧠", color: "text-rose-400", bg: "bg-rose-500/10" },
  { nameBn: "নৈতিকতা, মূল্যবোধ ও সু-শাসন", nameEn: "Ethics, Values & Good Governance", architectureName: "10_নৈতিকতা_মূল্যবোধ_ও_সু-শাসন", icon: "⚖️", color: "text-emerald-500", bg: "bg-emerald-500/10" },
];

export function subjectMetaByNameBn(nameBn: string): SubjectMeta | undefined {
  return SUBJECT_META.find((m) => m.nameBn.normalize("NFC") === nameBn.normalize("NFC"));
}

// Legacy folder names (pre-architecture) mapped to the current architecture
// subject segment so existing files keep importing without a rename.
const SUBJECT_FOLDER_ALIASES: Record<string, string> = {
  "International Affairs": "04_আন্তর্জাতিক_বিষয়াবলি",
  "English Language and Literature": "02_English_Language_and_Literature",
  "Bangla Language & Literature": "01_বাংলা_ভাষা_ও_সাহিত্য",
};

// Matches a folder segment to the taxonomy subject node: exact NFC name first,
// then the alias map. Returns the subject node or null.
export function resolveSubjectNode(root: TaxonomyNode, folder: string): TaxonomyNode | null {
  const norm = folder.trim().normalize("NFC");
  for (const s of root.children) {
    if (s.name.normalize("NFC") === norm) return s;
  }
  const alias = SUBJECT_FOLDER_ALIASES[norm] ?? SUBJECT_FOLDER_ALIASES[folder.trim()];
  if (alias) {
    for (const s of root.children) {
      if (s.name === alias) return s;
    }
  }
  return null;
}

// Walks down from `node` matching each path segment by NFC-normalised name.
// Returns the deepest matched node, or null if any segment is unknown.
export function matchNodePath(node: TaxonomyNode, segments: string[]): TaxonomyNode | null {
  let current = node;
  for (const seg of segments) {
    const norm = seg.normalize("NFC");
    const child = current.children.find((c) => c.name.normalize("NFC") === norm);
    if (!child) return null;
    current = child;
  }
  return current;
}

// Content path for a taxonomy node — the full path from the subject root
// (the repo root node is dropped), e.g. "04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা".
// This is the canonical value stored on Topic.path and Question.path, and the
// value the dashboard sends in exam selections.
export function contentPath(node: TaxonomyNode): string {
  const segs = node.path.split("/").filter(Boolean);
  return segs.slice(1).join("/");
}