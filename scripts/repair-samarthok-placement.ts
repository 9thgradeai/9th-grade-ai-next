#!/usr/bin/env tsx
/**
 * scripts/repair-samarthok-placement.ts
 * ----------------------------------------------------------------------------
 * Puts সমার্থক_শব্দ where the canonical taxonomy says it belongs — under
 * ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার — for BOTH the BCS and the Bank Bangla subject,
 * and returns to their own leaves the questions a one-shot temp script had
 * dragged into ভাষা/সমার্থক_শব্দ while doing so.
 *
 * Two populations sit at the wrong path today:
 *
 *   1. THE 200 SYNONYMS. scripts/seed-samarthok.ts seeded the 200 MCQs of
 *      Questions(সমার্থক শব্দ).txt at `${root}/ভাষা/সমার্থক_শব্দ` — a direct child
 *      of ভাষা — instead of the canonical leaf
 *      `${root}/ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/সমার্থক_শব্দ`. They are identified by
 *      (path = direct ∧ subtopic = সমার্থক_শব্দ) and moved to the leaf.
 *
 *   2. ~380 DISPLACED QUESTIONS (192 BCS + 190 Bank). A temp script
 *      (`scripts/.tmp-set-samarthok.ts`, untracked) ran
 *        UPDATE "Question" SET path='…/ভাষা/সমার্থক_শব্দ', "topicId"=… WHERE id IN (200 random ids)
 *      per subject, so unrelated rows (সমাস, বাক্য, ধ্বনি, literature authors …)
 *      lost their path/topicId. They are identified by
 *      (path = direct ∧ subtopic ≠ সমার্থক_শব্দ) and restored by, in order:
 *
 *        a) SIBLING EVIDENCE  — the mirrored row in the other ecosystem still
 *           sits at its canonical leaf; its path suffix (everything after the
 *           root segment) is matched onto this subject's own topic tree.
 *           Exact, not heuristic: resolves 366 of the 382 rows.
 *        b) SUBTOPIC MAJORITY — unanimous sibling-derived target for the same
 *           `subtopic` label (covers rows whose twin was dragged too).
 *        c) TOPIC NAME       — the row's `subtopic` is a Topic name in this
 *           subject (e.g. চণ্ডীমঙ্গল).
 *        d) CLASSIFIER       — scripts/untopiced-classifier.ts, the same
 *           content rules migrate-untopiced-questions.ts already trusts.
 *        Rows still unresolved after all four steps are reported and skipped —
 *        never guessed at.
 *
 * sourceKey is rewritten ONLY when it is provably derived from the damaged
 * path (md5(subjectId|directPath|question) still matches the stored value);
 * legacy keys — `sqlclone:<id>` clones and keys built from a row's ORIGINAL
 * path — are left byte-for-byte untouched.
 *
 * Nothing is deleted: every row keeps its id, options, answers, explanation
 * and all user progress (bookmarks/attempts/progress reference Question.id).
 * Only `path`, `topicId` and (when proven damaged) `sourceKey` change.
 * `Topic.questionCount` is then refreshed for every Topic of both Bangla
 * subjects (stored count := live subtree count), because strays leaving the
 * ভাষা subtree also change their ancestors' totals. The now-empty
 * `${root}/ভাষা/সমার্থক_শব্দ` topic row is kept: it holds no questions, and the
 * practice tree prunes zero-count nodes, so it simply disappears from the UI.
 *
 * The exam tree is server-cached (QueryCache), so the picker reflects the
 * repair on the next cache expiry — worst case a few minutes after --yes.
 *
 * Usage:
 *   npx tsx scripts/repair-samarthok-placement.ts          # dry run
 *   npx tsx scripts/repair-samarthok-placement.ts --yes    # apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { classifyQuestion, SUBJECT_PLANS } from "./untopiced-classifier";
import { parseSamarthokFile } from "./seed-samarthok";

const prisma = new PrismaClient();

const GRAMMAR_BRANCH = "ভাষা";
const SYNONYM_LEAF = "সমার্থক_শব্দ";
const ORTHO_GROUP = "অর্থতত্ত্ব_ও_শব্দভাণ্ডার";
const SOURCE_FILE =
  "database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /Questions(সমার্থক শব্দ).txt";

/** Classifier plan key per ecosystem. Both plans share the same Bangla grammar
 * rules; only the literature era branches differ (BCS vs Bank). */
const PLAN_KEY_BY_CODE: Record<string, string> = {
  BCS: "বাংলা ভাষা ও সাহিত্য",
  BANGLADESH_BANK: "01_Bangla_Language_and_Literature",
};

const nfc = (s: string) => s.normalize("NFC");

/** Taxonomy-relative suffix: everything after the root segment. The two trees
 * may spell the root differently, so cross-ecosystem evidence is always
 * compared on the suffix — same rule as backend/services/bangla-union.ts. */
function pathSuffix(path: string): string {
  const i = path.indexOf("/");
  return i < 0 ? "" : path.slice(i + 1);
}

type TopicLite = {
  id: number;
  path: string;
  name: string;
  depth: number;
  parentId: number | null;
  questionCount: number;
};

type Plan = {
  code: string;
  subjectId: number;
  subjectName: string;
  siblingId: number;
  planKey: string;
  subjectRoot: string;
  rootPath: string;
  directPath: string;
  leafPath: string;
};

type Move = {
  subjectId: number;
  id: number;
  question: string;
  storedKey: string;
  to: string;
  how: string;
};

/** Ensure the Topic row for `path` exists, creating the parent chain from the
 * path segments when it does not (same approach as repair-orphan-topics.ts). */
async function ensureTopic(
  subjectId: number,
  path: string,
  index: Map<string, TopicLite>,
  bySubject: Map<number, TopicLite[]>,
): Promise<number> {
  const hit = index.get(`${subjectId}|${path}`);
  if (hit) return hit.id;

  const segs = path.split("/").filter(Boolean);
  const name = segs[segs.length - 1];
  const parentPath = segs.slice(0, -1).join("/");
  let parentId: number | null = null;
  let depth = 0;
  if (parentPath) {
    parentId = await ensureTopic(subjectId, parentPath, index, bySubject);
    depth = (index.get(`${subjectId}|${parentPath}`)?.depth ?? 0) + 1;
  }
  const created = await prisma.topic.create({
    data: { subjectId, name, slug: name, path, depth, parentId, sortOrder: 0, questionCount: 0 },
  });
  const lite: TopicLite = {
    id: created.id,
    path,
    name,
    depth,
    parentId,
    questionCount: 0,
  };
  index.set(`${subjectId}|${path}`, lite);
  const list = bySubject.get(subjectId);
  if (list) list.push(lite);
  console.log(`  + created Topic #${created.id} ${path}`);
  return created.id;
}

async function main() {
  const apply = process.argv.includes("--yes");

  // ── Resolve the two Bangla subjects (never hardcode ids or root spelling) ─
  const ecosystems = await prisma.examEcosystem.findMany({ select: { id: true, code: true } });
  const ecoIdByCode = new Map<string, number>(ecosystems.map((e) => [e.code, e.id]));
  const topics = await prisma.topic.findMany({
    select: {
      id: true,
      path: true,
      name: true,
      depth: true,
      parentId: true,
      questionCount: true,
      subjectId: true,
    },
  });
  const rootBySubject = new Map<number, string>();
  for (const t of topics) {
    if (!t.path.endsWith(`/${GRAMMAR_BRANCH}`)) continue;
    const prev = rootBySubject.get(t.subjectId);
    if (!prev || t.path.length < prev.length) rootBySubject.set(t.subjectId, t.path);
  }
  const subjects = await prisma.subject.findMany({
    select: { id: true, nameBn: true, ecosystemId: true },
  });

  const plans: Plan[] = [];
  for (const [code, planKey] of Object.entries(PLAN_KEY_BY_CODE)) {
    const ecoId = ecoIdByCode.get(code);
    if (ecoId === undefined) throw new Error(`Ecosystem ${code} not found`);
    const cands = subjects.filter((s) => s.ecosystemId === ecoId && rootBySubject.has(s.id));
    if (cands.length !== 1) {
      throw new Error(
        `${code}: expected exactly 1 subject with a "${GRAMMAR_BRANCH}" root, found ${cands.length} ` +
          `(${cands.map((c) => c.nameBn).join(", ")})`,
      );
    }
    const s = cands[0];
    const rootPath = rootBySubject.get(s.id)!;
    plans.push({
      code,
      subjectId: s.id,
      subjectName: s.nameBn,
      siblingId: -1,
      planKey,
      subjectRoot: rootPath.split("/")[0],
      rootPath,
      directPath: `${rootPath}/${SYNONYM_LEAF}`,
      leafPath: `${rootPath}/${ORTHO_GROUP}/${SYNONYM_LEAF}`,
    });
  }
  if (plans.length !== 2) throw new Error(`Expected 2 Bangla subjects, found ${plans.length}`);
  plans[0].siblingId = plans[1].subjectId;
  plans[1].siblingId = plans[0].subjectId;

  const index = new Map<string, TopicLite>();
  const bySubject = new Map<number, TopicLite[]>();
  for (const t of topics) {
    index.set(`${t.subjectId}|${t.path}`, t);
    const list = bySubject.get(t.subjectId) ?? [];
    list.push(t);
    bySubject.set(t.subjectId, list);
  }
  /** suffix → absolute path within one subject's own tree. */
  const suffixIndex = (subjectId: number): Map<string, string> => {
    const idx = new Map<string, string>();
    for (const t of bySubject.get(subjectId) ?? []) {
      const s = pathSuffix(t.path);
      if (s && !idx.has(s)) idx.set(s, t.path);
    }
    return idx;
  };

  console.log(apply ? "APPLY" : "DRY RUN");
  for (const p of plans) {
    console.log(`  ${p.code.padEnd(6)} subject ${p.subjectId}  ${p.subjectName}`);
    console.log(`         wrong    ${p.directPath}`);
    console.log(`         target   ${p.leafPath}`);
  }
  const expected = parseSamarthokFile(readFileSync(join(process.cwd(), SOURCE_FILE), "utf8")).length;
  console.log(`\nSource file: ${expected} MCQs in ${SOURCE_FILE}`);

  // ── Phase 1: restore the displaced rows ───────────────────────────────────
  const restores: Move[] = [];
  const unresolved: Array<{ subjectId: number; code: string; id: number; subtopic: string; question: string }> = [];

  for (const plan of plans) {
    const strays = await prisma.question.findMany({
      where: {
        subjectId: plan.subjectId,
        path: plan.directPath,
        subtopic: { not: SYNONYM_LEAF },
      },
      select: { id: true, question: true, subtopic: true, explanation: true, sourceKey: true },
    });
    console.log(`\n${plan.code}: ${strays.length} displaced row(s) parked at ${plan.directPath}`);
    if (strays.length === 0) continue;

    // (a) sibling evidence — canonical path of the mirrored row
    const texts = [...new Set(strays.map((r) => r.question))];
    const sibRows = await prisma.question.findMany({
      where: { subjectId: plan.siblingId, question: { in: texts } },
      select: { question: true, path: true },
    });
    const sibDirectPath = plans.find((x) => x.subjectId === plan.siblingId)!.directPath;
    const sibPaths = new Map<string, string[]>();
    for (const r of sibRows) {
      if (r.path === sibDirectPath) continue; // twin was dragged too
      const list = sibPaths.get(nfc(r.question)) ?? [];
      list.push(r.path);
      sibPaths.set(nfc(r.question), list);
    }

    const ownIdx = suffixIndex(plan.subjectId);
    const fromSuffix = (siblingPath: string): string | undefined =>
      ownIdx.get(pathSuffix(siblingPath)) ?? ownIdx.get(siblingPath);

    const stepA = new Map<number, string>();
    const votes = new Map<string, Map<string, number>>();
    for (const r of strays) {
      const cands = sibPaths.get(nfc(r.question));
      if (!cands || cands.length === 0) continue;
      const distinct = [...new Set(cands)];
      if (distinct.length > 1) {
        console.log(`  ⚠ id=${r.id}: twin sits at ${distinct.length} paths — ${JSON.stringify(distinct)}`);
      }
      const target = fromSuffix(distinct[0]);
      if (!target) {
        console.log(`  ⚠ id=${r.id}: sibling path ${distinct[0]} has no Topic here`);
        continue;
      }
      stepA.set(r.id, target);
      if (r.subtopic) {
        const m = votes.get(r.subtopic) ?? new Map<string, number>();
        m.set(target, (m.get(target) ?? 0) + 1);
        votes.set(r.subtopic, m);
      }
    }

    // (b) unanimous subtopic majority, derived only from rows resolved by (a)
    const majority = new Map<string, string>();
    for (const [sub, m] of votes) {
      if (m.size === 1) majority.set(sub, [...m.keys()][0]);
      else console.log(`  ⚠ subtopic "${sub}" has ${m.size} sibling-derived targets — majority not used`);
    }

    const byHow = new Map<string, number>();
    for (const r of strays) {
      let to = stepA.get(r.id);
      let how = "sibling";
      if (!to && r.subtopic && majority.has(r.subtopic)) {
        to = majority.get(r.subtopic)!;
        how = "subtopic-majority";
      }
      if (!to && r.subtopic) {
        const named = (bySubject.get(plan.subjectId) ?? []).filter((t) => t.name === r.subtopic);
        if (named.length === 1) {
          to = named[0].path;
          how = "topic-name";
        }
      }
      if (!to && SUBJECT_PLANS[plan.planKey]) {
        // classifyQuestion returns a path relative to the SUBJECT ROOT (it
        // starts with ভাষা/ or সাহিত্য/) — rootPath already carries ভাষা, so
        // prefix only the root segment, never rootPath itself.
        const rel = classifyQuestion(plan.planKey, r.question, r.explanation ?? "");
        const cand = rel ? `${plan.subjectRoot}/${rel}` : null;
        if (cand && index.has(`${plan.subjectId}|${cand}`)) {
          to = cand;
          how = "classifier";
        }
      }
      if (!to) {
        unresolved.push({
          subjectId: plan.subjectId,
          code: plan.code,
          id: r.id,
          subtopic: r.subtopic,
          question: r.question,
        });
        continue;
      }
      byHow.set(how, (byHow.get(how) ?? 0) + 1);
      restores.push({
        subjectId: plan.subjectId,
        id: r.id,
        question: r.question,
        storedKey: r.sourceKey,
        to,
        how,
      });
    }
    const resolved = [...byHow.values()].reduce((a, b) => a + b, 0);
    console.log(
      `  plan: ${resolved}/${strays.length} resolved → ` +
        [...byHow.entries()].map(([k, v]) => `${v} by ${k}`).join(", ") +
        (resolved < strays.length ? `; ${strays.length - resolved} unresolved` : ""),
    );
  }

  if (unresolved.length > 0) {
    console.log(`\n⚠ UNRESOLVED (${unresolved.length}) — skipped, left where they are:`);
    for (const u of unresolved) {
      console.log(`   ${u.code} id=${u.id} sub="${u.subtopic}" :: ${u.question.slice(0, 70)}`);
    }
  }

  // ── Phase 2: move the synonyms onto the canonical leaf ────────────────────
  const synonyms: Move[] = [];
  for (const plan of plans) {
    const rows = await prisma.question.findMany({
      where: { subjectId: plan.subjectId, path: plan.directPath, subtopic: SYNONYM_LEAF },
      select: { id: true, question: true, sourceKey: true },
    });
    const inFile = new Set(
      parseSamarthokFile(readFileSync(join(process.cwd(), SOURCE_FILE), "utf8")).map((q) => nfc(q.question)),
    );
    const matched = rows.filter((r) => inFile.has(nfc(r.question))).length;
    console.log(
      `\n${plan.code}: ${rows.length} synonym row(s) → ${plan.leafPath}` +
        ` (${matched}/${expected} match the source file)`,
    );
    if (rows.length !== expected) {
      console.log(`  ⚠ expected ${expected} — verify before applying if this surprises you`);
    }
    for (const r of rows) {
      synonyms.push({
        subjectId: plan.subjectId,
        id: r.id,
        question: r.question,
        storedKey: r.sourceKey,
        to: plan.leafPath,
        how: "samarthok-seed",
      });
    }
  }

  // ── Per-target summary (what the apply would write) ──────────────────────
  const allMoves = [...restores, ...synonyms];
  const perTarget = new Map<string, { n: number; hows: Set<string> }>();
  for (const m of allMoves) {
    const e = perTarget.get(m.to) ?? { n: 0, hows: new Set<string>() };
    e.n++;
    e.hows.add(m.how);
    perTarget.set(m.to, e);
  }
  console.log(`\nTargets (${perTarget.size}):`);
  for (const [path, e] of [...perTarget.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(e.n).padStart(4)}  ${path}   [${[...e.hows].join(", ")}]`);
  }
  console.log(
    `\nTotal: ${restores.length} restore + ${synonyms.length} move = ${allMoves.length} row(s)`,
  );

  if (!apply) {
    console.log("\nDRY RUN — no writes. Re-run with --yes to apply.");
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  // Resolve every target Topic id sequentially first (creation of a missing
  // parent chain must not race), then write rows in bounded batches.
  const topicIdByTarget = new Map<string, number>();
  for (const m of allMoves) {
    const k = `${m.subjectId}|${m.to}`;
    if (!topicIdByTarget.has(k)) {
      topicIdByTarget.set(k, await ensureTopic(m.subjectId, m.to, index, bySubject));
    }
  }

  // sourceKey: rewrite only keys provably derived from the damaged path.
  const damagedPathBySubject = new Map(plans.map((p) => [p.subjectId, p.directPath]));
  const freshKey = new Map<number, string>();
  const keyCandidates = new Map<number, string[]>();
  for (const m of allMoves) {
    const damaged = sourceKey(m.subjectId, damagedPathBySubject.get(m.subjectId)!, m.question);
    if (m.storedKey !== damaged) continue; // legacy / sqlclone / original-path key
    const fresh = sourceKey(m.subjectId, m.to, m.question);
    if (fresh === m.storedKey) continue;
    freshKey.set(m.id, fresh);
    const list = keyCandidates.get(m.subjectId) ?? [];
    list.push(fresh);
    keyCandidates.set(m.subjectId, list);
  }
  let keyDropped = 0;
  for (const [subjectId, keys] of keyCandidates) {
    const clashes = await prisma.question.findMany({
      where: { subjectId, sourceKey: { in: keys } },
      select: { id: true, sourceKey: true },
    });
    const byKey = new Map(clashes.map((c) => [c.sourceKey, c.id]));
    for (const m of allMoves) {
      if (m.subjectId !== subjectId) continue;
      const fresh = freshKey.get(m.id);
      if (!fresh) continue;
      const owner = byKey.get(fresh);
      if (owner !== undefined && owner !== m.id) {
        freshKey.delete(m.id);
        keyDropped++;
        console.log(`  ⚠ id=${m.id}: new sourceKey already used by id=${owner} — key left as-is`);
      }
    }
  }

  // ── Pre-apply snapshot (id → path/topicId/sourceKey) for rollback ─────────
  const snapshot = await prisma.question.findMany({
    where: { id: { in: allMoves.map((m) => m.id) } },
    select: { id: true, path: true, topicId: true, sourceKey: true },
  });
  const backupPath = join(tmpdir(), "samarthok-repair-backup.json");
  writeFileSync(backupPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n↳ pre-apply snapshot of ${snapshot.length} row(s) → ${backupPath}`);

  // One transaction: path/topicId per target (a single UPDATE each), then the
  // sourceKey rewrites, then the questionCount refresh — all-or-nothing.
  const byTarget = new Map<string, { subjectId: number; path: string; ids: number[] }>();
  for (const m of allMoves) {
    const k = `${m.subjectId}|${m.to}`;
    const g = byTarget.get(k) ?? { subjectId: m.subjectId, path: m.to, ids: [] };
    g.ids.push(m.id);
    byTarget.set(k, g);
  }

  const started = Date.now();
  const result = await prisma.$transaction(
    async (tx) => {
      let moved = 0;
      for (const [k, g] of byTarget) {
        const res = await tx.question.updateMany({
          where: { id: { in: g.ids } },
          data: { path: g.path, topicId: topicIdByTarget.get(k)! },
        });
        moved += res.count;
      }

      let keys = 0;
      for (const m of allMoves) {
        const fresh = freshKey.get(m.id);
        if (!fresh) continue;
        await tx.question.update({ where: { id: m.id }, data: { sourceKey: fresh } });
        keys++;
      }

      // Topic.questionCount := live subtree count. Strays leaving the ভাষা
      // subtree change ancestor totals too (some land in সাহিত্য), so every
      // Topic of both Bangla subjects is re-derived — same approach as
      // repair-orphan-topics.ts.
      let topicsRefreshed = 0;
      let topicsScanned = 0;
      for (const plan of plans) {
        const groups = await tx.question.groupBy({
          by: ["path"],
          where: { subjectId: plan.subjectId },
          _count: { _all: true },
        });
        const live = groups.map((g2) => [g2.path, g2._count._all] as const);
        for (const t of bySubject.get(plan.subjectId) ?? []) {
          topicsScanned++;
          let subtree = 0;
          for (const [p, n] of live) {
            if (p === t.path || p.startsWith(`${t.path}/`)) subtree += n;
          }
          if (subtree === t.questionCount) continue;
          await tx.topic.update({ where: { id: t.id }, data: { questionCount: subtree } });
          t.questionCount = subtree;
          topicsRefreshed++;
        }
      }
      return { moved, keys, topicsRefreshed, topicsScanned };
    },
    { timeout: 300_000, maxWait: 60_000 },
  );
  console.log(
    `✓ moved ${result.moved} row(s); sourceKey rewritten on ${result.keys}` +
      `${keyDropped ? ` (${keyDropped} left untouched to avoid a clash)` : ""}; ` +
      `questionCount refreshed on ${result.topicsRefreshed}/${result.topicsScanned} Topic row(s) ` +
      `(${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log("\nVERIFICATION");
  let ok = true;
  for (const plan of plans) {
    const directCount = await prisma.question.count({
      where: { subjectId: plan.subjectId, path: plan.directPath },
    });
    const leafCount = await prisma.question.count({
      where: { subjectId: plan.subjectId, path: plan.leafPath },
    });
    const groups = await prisma.question.groupBy({
      by: ["path"],
      where: { subjectId: plan.subjectId },
      _count: { _all: true },
    });
    const live = groups.map((g) => [g.path, g._count._all] as const);
    const drift: string[] = [];
    for (const t of bySubject.get(plan.subjectId) ?? []) {
      let subtree = 0;
      for (const [p, n] of live) {
        if (p === t.path || p.startsWith(`${t.path}/`)) subtree += n;
      }
      if (subtree !== t.questionCount) drift.push(`${t.path}: stored=${t.questionCount} live=${subtree}`);
    }
    console.log(
      `  ${plan.code}: ${plan.directPath} = ${directCount} (expect 0) | ` +
        `${ORTHO_GROUP}/${SYNONYM_LEAF} = ${leafCount} | stored≠live = ${drift.length}`,
    );
    for (const d of drift.slice(0, 10)) console.log(`     drift ${d}`);
    if (directCount !== 0 || drift.length > 0) ok = false;
  }
  console.log(ok ? "\n✅ repair applied and verified" : "\n❌ verification failed — inspect the drift above");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
