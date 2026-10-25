/**
 * tests/unit/backend/bangla-taxonomy-parity.test.ts
 * ----------------------------------------------------------------------------
 * The BCS and the Bank share ONE Bangla practice pool: the cross-ecosystem
 * union (backend/services/bangla-union.ts) pairs a leaf on one side with the
 * leaf of the SAME relative path on the other side.
 *
 * If the two Bangla trees spell a leaf differently — or one side has no leaf
 * for a topic the other side fills — a topic silently loses (or duplicates)
 * the other ecosystem's questions in the Practice tab. The 2026-10-22 Bank
 * taxonomy revision did exactly that (ADR-068); this test is the guard.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Node = { name: string; children: Node[] };

const BCS_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";
const BANK_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";

function load(file: string): Node {
  return JSON.parse(readFileSync(join(process.cwd(), file), "utf8")) as Node;
}

const bcs = load("database/data/taxonomy.json");
const bank = load("database/data/bb-taxonomy.json");

const bcsBangla = bcs.children.find((c) => c.name === BCS_ROOT)!;
const bankBangla = bank.children.find((c) => c.name === BANK_ROOT)!;

/** Leaf paths (relative to the subject root) of a subtree. */
function leaves(node: Node, prefix = ""): string[] {
  const p = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.children.length === 0) return [p];
  return node.children.flatMap((c) => leaves(c, p));
}

function subtree(root: Node, name: string): Node | undefined {
  return root.children.find((c) => c.name === name);
}

describe("BCS ↔ Bank Bangla taxonomy parity", () => {
  it("uses the same grammar (ভাষা) leaf names on both sides", () => {
    const bcsGrammar = leaves(subtree(bcsBangla, "ভাষা")!);
    const bankGrammar = leaves(subtree(bankBangla, "ভাষা")!);
    expect(bcsGrammar.length).toBeGreaterThan(0);
    expect([...bankGrammar].sort()).toEqual([...bcsGrammar].sort());
  });

  it("groups the grammar leaves the same way (শব্দতত্ত্ব · ধ্বনিতত্ত্ব · বাক্যতত্ত্ব · …)", () => {
    const groups = (root: Node) =>
      subtree(root, "ভাষা")!.children.map((c) => c.name).sort();
    expect(groups(bcsBangla)).toEqual(groups(bankBangla));
  });

  it("keeps the literary-history leaves on both sides", () => {
    // The কথা-সাহিত্য / গদ্যের উৎপত্তি / নাটক sets exist in both trees — the
    // Bank revision had dropped them, which silently emptied the BCS's
    // literature leaves.
    const era = "আধুনিক_যুগ_১৮০০_হতে_বর্তমান";
    const genreLeaves = ["বাংলা_কথা-সাহিত্য", "বাংলা_গদ্যের_উৎপত্তি_ও_বিকাশ", "বাংলা_নাটক"];
    for (const root of [bcsBangla, bankBangla]) {
      const eraNode = subtree(subtree(root, "সাহিত্য")!, era)!;
      const names = eraNode.children.map((c) => c.name);
      for (const leaf of genreLeaves) expect(names).toContain(leaf);
    }
  });

  it("keeps the author tiers aligned so each author pairs 1:1", () => {
    const era = "আধুনিক_যুগ_১৮০০_হতে_বর্তমান";
    const tiers = ["Tier_01_মাস্টার_হট_স্পট", "Tier_02_ভেরি_হাই_ইল্ড", "Tier_03_ফোকাসড_লেখক"];
    for (const root of [bcsBangla, bankBangla]) {
      const eraNode = subtree(subtree(root, "সাহিত্য")!, era)!;
      const names = eraNode.children.map((c) => c.name);
      for (const tier of tiers) expect(names).toContain(tier);
    }
  });
});
