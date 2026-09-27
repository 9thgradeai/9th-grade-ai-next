import { describe, it, expect } from "vitest";
import {
  isBanglaSubjectName,
  pathSuffix,
  mapSiblingPaths,
  unionEligibleLeaves,
  foldSiblingCounts,
} from "~backend/services/bangla-union";

describe("isBanglaSubjectName (Bangla-only gate)", () => {
  it("matches BCS + Bank + legacy Bangla subjects", () => {
    expect(isBanglaSubjectName("বাংলা ভাষা ও সাহিত্য")).toBe(true);
    expect(isBanglaSubjectName("০১_বাংলা_ভাষা_ও_সাহিত্য")).toBe(true);
    expect(isBanglaSubjectName("বাংলা ব্যাকরণ ও সাহিত্য")).toBe(true);
  });

  it("rejects lookalikes and other subjects", () => {
    expect(isBanglaSubjectName("বাংলাদেশ বিষয়াবলি")).toBe(false);
    expect(isBanglaSubjectName("সাধারণ জ্ঞান")).toBe(false);
    expect(isBanglaSubjectName("English Language and Literature")).toBe(false);
    expect(isBanglaSubjectName("গাণিতিক যুক্তি")).toBe(false);
    expect(isBanglaSubjectName("বাংলা")).toBe(false);
    expect(isBanglaSubjectName(null)).toBe(false);
    expect(isBanglaSubjectName("")).toBe(false);
  });
});

describe("pathSuffix", () => {
  it("strips the subject root segment", () => {
    expect(pathSuffix("০১_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/বানান")).toBe("ভাষা/বানান");
    expect(pathSuffix("01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা")).toBe("ভাষা");
    expect(pathSuffix("root")).toBe("");
  });
});

const BCS = 1;
const BANK = 7;
const BCS_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";
const BANK_ROOT = "০১_বাংলা_ভাষা_ও_সাহিত্য";

function leafCounts(): Map<number, Map<string, number>> {
  return new Map([
    [BANK, new Map([[`${BANK_ROOT}/ভাষা/বানান`, 5]])],
    [BCS, new Map([
      [`${BCS_ROOT}/ভাষা/বানান`, 40],
      [`${BCS_ROOT}/সাহিত্য/প্রাচীন`, 30],
    ])],
  ]);
}

describe("mapSiblingPaths", () => {
  const sib = new Map([[BCS, [`${BCS_ROOT}/ভাষা/বানান`, `${BCS_ROOT}/সাহিত্য/প্রাচীন`]]]);

  it("maps a selected Bank node to the matching BCS absolute leaf", () => {
    expect(mapSiblingPaths(sib, [BCS], [`${BANK_ROOT}/ভাষা`])).toEqual([
      `${BCS_ROOT}/ভাষা/বানান`,
    ]);
  });

  it("returns all sibling leaves when no paths selected (whole subject)", () => {
    expect(mapSiblingPaths(sib, [BCS], [])).toHaveLength(2);
  });

  it("returns nothing when taxonomies do not overlap", () => {
    expect(mapSiblingPaths(sib, [BCS], [`${BANK_ROOT}/অজানা`])).toEqual([]);
  });
});

describe("unionEligibleLeaves", () => {
  it("unions own + sibling leaves for a selected node", () => {
    const pairs = unionEligibleLeaves(leafCounts(), BANK, [BCS], [`${BANK_ROOT}/ভাষা`]);
    expect(pairs).toContainEqual({ subjectId: BANK, path: `${BANK_ROOT}/ভাষা/বানান` });
    expect(pairs).toContainEqual({ subjectId: BCS, path: `${BCS_ROOT}/ভাষা/বানান` });
    expect(pairs).not.toContainEqual({ subjectId: BCS, path: `${BCS_ROOT}/সাহিত্য/প্রাচীন` });
  });

  it("includes everything when paths is empty", () => {
    expect(unionEligibleLeaves(leafCounts(), BANK, [BCS], [])).toHaveLength(3);
  });
});

describe("foldSiblingCounts", () => {
  it("folds sibling counts onto exact-suffix own nodes", () => {
    const extra = foldSiblingCounts(
      [`${BANK_ROOT}/ভাষা/বানান`, `${BANK_ROOT}/সাহিত্য`],
      [
        { path: `${BCS_ROOT}/ভাষা/বানান`, count: 40 },
        { path: `${BCS_ROOT}/সাহিত্য/প্রাচীন`, count: 30 },
      ],
    );
    expect(extra.get(`${BANK_ROOT}/ভাষা/বানান`)).toBe(40);
    // No exact Bank leaf for প্রাচীন → deepest prefix node (সাহিত্য).
    expect(extra.get(`${BANK_ROOT}/সাহিত্য`)).toBe(30);
  });

  it("drops sibling leaves with no matching subtree", () => {
    const extra = foldSiblingCounts([`${BANK_ROOT}/ভাষা`], [
      { path: `${BCS_ROOT}/অজানা/বিষয়`, count: 9 },
    ]);
    expect(extra.size).toBe(0);
  });
});
