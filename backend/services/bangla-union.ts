// backend/services/bangla-union.ts — Bangla-only cross-ecosystem question union.
//
// Product rule: the BCS Bangla pool ("বাংলা ভাষা ও সাহিত্য") is shared into the
// Bank Bangla subject ("০১_বাংলা_ভাষা_ও_সাহিত্য") and vice versa, so Practice
// (quick fetch + custom-exam build) sees one combined Bangla pool. ONLY Bangla
// subjects participate — every other subject keeps strict ecosystem isolation.
//
// Why suffix mapping: the two taxonomies use different root segments
// (BCS `01_বাংলা_ভাষা_ও_সাহিত্য/…` vs Bank `০১_বাংলা_ভাষা_ও_সাহিত্য/…`), so an
// absolute path selected on one side never matches rows on the other. Leaves
// are matched by taxonomy-relative suffix (everything after the first `/`),
// exact or subtree, computed in JS over absolute paths — no LIKE games.

import "server-only";

import { prisma } from "~backend/db";

/** True for Bangla language/literature subjects in any ecosystem. The second
 * clause excludes lookalikes such as "বাংলাদেশ বিষয়াবলি". */
export function isBanglaSubjectName(nameBn: string | null | undefined): boolean {
  if (!nameBn) return false;
  return (
    nameBn.includes("বাংলা") &&
    (nameBn.includes("ভাষা") || nameBn.includes("সাহিত্য") || nameBn.includes("ব্যাকরণ"))
  );
}

/** Taxonomy-relative suffix: everything after the first path segment
 * ("০১_…/ভাষা/বানান" → "ভাষা/বানান"). Paths without "/" have no suffix. */
export function pathSuffix(path: string): string {
  const i = path.indexOf("/");
  return i < 0 ? "" : path.slice(i + 1);
}

type BanglaSubjectSet = { ids: number[]; names: Map<number, string> };

let subjectsCache: { at: number; value: BanglaSubjectSet } | null = null;
const SUBJECTS_CACHE_MS = 5 * 60_000;

/** All Bangla subject rows across ecosystems (BCS + Bank). Small table scan,
 * cached 5 minutes — subjects change only via seed scripts. */
export async function getBanglaSubjects(): Promise<BanglaSubjectSet> {
  if (subjectsCache && Date.now() - subjectsCache.at < SUBJECTS_CACHE_MS) {
    return subjectsCache.value;
  }
  const rows = (await prisma.subject.findMany({ select: { id: true, nameBn: true } })) ?? [];
  const bangla = rows.filter((r) => isBanglaSubjectName(r.nameBn));
  const value: BanglaSubjectSet = {
    ids: bangla.map((r) => r.id),
    names: new Map(bangla.map((r) => [r.id, r.nameBn])),
  };
  subjectsCache = { at: Date.now(), value };
  return value;
}

/** Test seam: clear the module cache. */
export function clearBanglaSubjectsCache(): void {
  subjectsCache = null;
}

let leafPathsCache: { at: number; value: Map<number, string[]> } | null = null;

/** Absolute leaf paths per Bangla subject (one groupBy, cached 5 minutes). */
export async function getBanglaLeafPaths(siblingIds: number[]): Promise<Map<number, string[]>> {
  if (leafPathsCache && Date.now() - leafPathsCache.at < SUBJECTS_CACHE_MS) {
    return leafPathsCache.value;
  }
  const rows = (await prisma.question.groupBy({
    by: ["subjectId", "path"],
    where: { subjectId: { in: siblingIds } },
  })) ?? [];
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const list = map.get(row.subjectId) ?? [];
    list.push(row.path);
    map.set(row.subjectId, list);
  }
  leafPathsCache = { at: Date.now(), value: map };
  return map;
}

/** Test seam: clear the module cache. */
export function clearBanglaLeafPathsCache(): void {
  leafPathsCache = null;
}

/**
 * Map requested absolute paths to matching ABSOLUTE leaf paths on sibling
 * Bangla subjects. Empty `requested` means the whole subject → all sibling
 * leaves. Matching is by relative suffix (exact leaf or subtree).
 */
export function mapSiblingPaths(
  siblingLeafPaths: Map<number, string[]>,
  siblingIds: number[],
  requested: string[],
): string[] {
  const out: string[] = [];
  if (requested.length === 0) {
    for (const sid of siblingIds) out.push(...(siblingLeafPaths.get(sid) ?? []));
    return out;
  }
  const suffixes = requested.map(pathSuffix).filter((s) => s.length > 0);
  if (suffixes.length === 0) return out;
  for (const sid of siblingIds) {
    for (const leaf of siblingLeafPaths.get(sid) ?? []) {
      const ls = pathSuffix(leaf);
      if (suffixes.some((s) => ls === s || ls.startsWith(`${s}/`))) out.push(leaf);
    }
  }
  return out;
}

/**
 * Eligible (subjectId, path) pairs for an exam build: the subject's own
 * leaves (absolute match, same as before) plus sibling Bangla leaves mapped
 * by suffix. `leafCounts` is subjectId → path → count (see getLeafCounts).
 */
export function unionEligibleLeaves(
  leafCounts: Map<number, Map<string, number>>,
  subjectId: number,
  siblingIds: number[],
  paths: string[],
): Array<{ subjectId: number; path: string }> {
  const out: Array<{ subjectId: number; path: string }> = [];
  const pushFor = (sid: number, leaves: string[], wanted: string[], bySuffix: boolean) => {
    if (wanted.length === 0) {
      for (const leaf of leaves) out.push({ subjectId: sid, path: leaf });
      return;
    }
    if (!bySuffix) {
      for (const leaf of leaves) {
        if (wanted.some((p) => leaf === p || leaf.startsWith(`${p}/`))) {
          out.push({ subjectId: sid, path: leaf });
        }
      }
      return;
    }
    const suffixes = wanted.map(pathSuffix).filter((s) => s.length > 0);
    for (const leaf of leaves) {
      const ls = pathSuffix(leaf);
      if (suffixes.some((s) => ls === s || ls.startsWith(`${s}/`))) {
        out.push({ subjectId: sid, path: leaf });
      }
    }
  };

  pushFor(subjectId, [...(leafCounts.get(subjectId) ?? new Map()).keys()], paths, false);
  for (const sib of siblingIds) {
    if (sib === subjectId) continue;
    pushFor(sib, [...(leafCounts.get(sib) ?? new Map()).keys()], paths, true);
  }
  return out;
}

/**
 * Fold sibling Bangla counts into a subject's count map so selection-tree
 * nodes never prune to zero where the union has questions. `ownPaths` are
 * this subject's topic-tree absolute paths; sibling rows are attached by
 * suffix: exact leaf match first, else the deepest node whose suffix is a
 * proper prefix (ancestors aggregate automatically in buildNode).
 * Returns the extra counts keyed by own absolute path.
 */
export function foldSiblingCounts(
  ownPaths: string[],
  siblingLeaves: Array<{ path: string; count: number }>,
): Map<string, number> {
  const extra = new Map<string, number>();
  if (ownPaths.length === 0 || siblingLeaves.length === 0) return extra;
  const suffixIndex = new Map<string, string>();
  for (const p of ownPaths) {
    const s = pathSuffix(p);
    if (s && !suffixIndex.has(s)) suffixIndex.set(s, p);
  }
  for (const { path, count } of siblingLeaves) {
    const s = pathSuffix(path);
    if (!s) continue;
    let target = suffixIndex.get(s);
    if (!target) {
      // Deepest own node whose suffix is a proper prefix of the sibling leaf.
      let best = "";
      for (const [suffix, ownPath] of suffixIndex) {
        if (s.startsWith(`${suffix}/`) && suffix.length > best.length) {
          best = suffix;
          target = ownPath;
        }
      }
    }
    if (target) extra.set(target, (extra.get(target) ?? 0) + count);
  }
  return extra;
}
