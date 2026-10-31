/**
 * tests/qb-media-attachments.test.ts
 * ----------------------------------------------------------------------------
 * Figure sidecar contract for the question importers
 * (scripts/media-attachments.ts):
 *   1. `q<n>.<ext>` files attach to record n, Bengali numerals included.
 *   2. The `<stem>.figures.json` sidecar overrides and extends discovery, and
 *      supports both URL entries and local `file` entries.
 *   3. Local files are copied into public/question-media/<slug>/ and the DB
 *      only ever sees URL paths.
 *   4. Bad input warns instead of throwing — a malformed figure never aborts
 *      an otherwise valid import.
 * ----------------------------------------------------------------------------
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  bnDigitsToLatin,
  figureNumberFromName,
  normalizeMediaValue,
  numberKey,
  parseFiguresSidecar,
  resolveFigureMedia,
} from "../scripts/media-attachments";

const dirs: string[] = [];

function makeTree(): { sourceDir: string; publicRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "qb-media-"));
  dirs.push(root);
  const sourceDir = join(root, "src");
  const publicRoot = join(root, "public", "question-media");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(publicRoot, { recursive: true });
  return { sourceDir, publicRoot };
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("bnDigitsToLatin / numberKey", () => {
  it("converts Bengali digits", () => {
    expect(bnDigitsToLatin("০১৪")).toBe("014");
    expect(numberKey("০১৪")).toBe(14);
    expect(numberKey("014")).toBe(14);
    expect(numberKey(14)).toBe(14);
  });

  it("rejects non-numbers and zero", () => {
    expect(numberKey("abc")).toBeNull();
    expect(numberKey("0")).toBeNull();
    expect(numberKey("-3")).toBeNull();
  });
});

describe("figureNumberFromName", () => {
  it("reads q<number>.<ext>", () => {
    expect(figureNumberFromName("q014.png")).toBe(14);
    expect(figureNumberFromName("q১৪.WebP")).toBe(14);
  });

  it("ignores names outside the convention", () => {
    expect(figureNumberFromName("figure-14.png")).toBeNull();
    expect(figureNumberFromName("q14")).toBeNull();
  });
});

describe("parseFiguresSidecar", () => {
  it("accepts a bare URL string", () => {
    const m = parseFiguresSidecar({ "14": "/question-media/x/q014.png" });
    expect(m.get(14)?.entries).toEqual([{ kind: "image", url: "/question-media/x/q014.png" }]);
  });

  it("accepts entry objects with alt text", () => {
    const m = parseFiguresSidecar({
      14: [{ kind: "image", url: "/a.png", alt: "চিত্র ১" }],
    });
    expect(m.get(14)?.entries).toEqual([{ kind: "image", url: "/a.png", alt: "চিত্র ১" }]);
  });

  it("routes local `file` entries separately", () => {
    const m = parseFiguresSidecar({ 14: [{ file: "custom.png", alt: "জাল" }] });
    expect(m.get(14)?.entries).toEqual([]);
    expect(m.get(14)?.files).toEqual([{ file: "custom.png", alt: "জাল" }]);
  });

  it("drops unusable keys and values", () => {
    expect(parseFiguresSidecar({ nope: "/a.png", 0: "/b.png" }).size).toBe(0);
    expect(parseFiguresSidecar({ 5: [] }).size).toBe(0);
    expect(parseFiguresSidecar({ 5: null }).size).toBe(0);
    expect(parseFiguresSidecar([]).size).toBe(0);
    expect(parseFiguresSidecar("nope").size).toBe(0);
  });
});

describe("normalizeMediaValue", () => {
  it("never emits an entry without a url", () => {
    expect(normalizeMediaValue({ alt: "x" }).entries).toEqual([]);
    expect(normalizeMediaValue("").entries).toEqual([]);
    expect(normalizeMediaValue(undefined).entries).toEqual([]);
  });
});

describe("resolveFigureMedia", () => {
  it("returns nothing when there is no figures folder", () => {
    const { sourceDir, publicRoot } = makeTree();
    const r = resolveFigureMedia({ sourceDir, stem: "Questions[x]", slug: "bcs-mental/problem-solving", publicRoot });
    expect(r.byNumber.size).toBe(0);
    expect(r.warnings).toEqual([]);
    expect(r.copied).toBe(0);
  });

  it("attaches q<n>.<ext> files and copies them into public", () => {
    const { sourceDir, publicRoot } = makeTree();
    const figDir = join(sourceDir, "Questions[x].figures");
    mkdirSync(figDir);
    writeFileSync(join(figDir, "q014.png"), "png-14");
    writeFileSync(join(figDir, "q১৫.jpg"), "jpg-15");

    const r = resolveFigureMedia({ sourceDir, stem: "Questions[x]", slug: "bcs-mental/problem-solving", publicRoot });

    expect(r.warnings).toEqual([]);
    expect(r.copied).toBe(2);
    expect(r.byNumber.get(14)).toEqual([
      { kind: "image", url: "/question-media/bcs-mental/problem-solving/q014.png" },
    ]);
    expect(r.byNumber.get(15)).toEqual([
      { kind: "image", url: "/question-media/bcs-mental/problem-solving/q%E0%A7%A7%E0%A7%AB.jpg" },
    ]);
    expect(existsSync(join(publicRoot, "bcs-mental/problem-solving/q014.png"))).toBe(true);
  });

  it("lets the sidecar override discovery and add alt text", () => {
    const { sourceDir, publicRoot } = makeTree();
    const figDir = join(sourceDir, "Questions[x].figures");
    mkdirSync(figDir);
    writeFileSync(join(figDir, "q014.png"), "png-14");
    writeFileSync(
      join(sourceDir, "Questions[x].figures.json"),
      JSON.stringify({ 14: [{ kind: "image", url: "/custom/q014.png", alt: "চিত্র ১" }] }),
    );

    const r = resolveFigureMedia({ sourceDir, stem: "Questions[x]", slug: "bcs-mental/problem-solving", publicRoot });

    expect(r.byNumber.get(14)).toEqual([{ kind: "image", url: "/custom/q014.png", alt: "চিত্র ১" }]);
    // sidecar URL is user-managed → warns because it is not under public/
    expect(r.warnings.some((w) => w.includes("/custom/q014.png"))).toBe(true);
  });

  it("copies sidecar `file` entries relative to the figures folder", () => {
    const { sourceDir, publicRoot } = makeTree();
    const figDir = join(sourceDir, "Questions[x].figures");
    mkdirSync(figDir);
    writeFileSync(join(figDir, "custom-60.webp"), "webp-60");
    writeFileSync(
      join(sourceDir, "Questions[x].figures.json"),
      JSON.stringify({ "৬০": [{ file: "custom-60.webp", alt: "ঘনকের জাল" }] }),
    );

    const r = resolveFigureMedia({ sourceDir, stem: "Questions[x]", slug: "bcs-mental/problem-solving", publicRoot });

    expect(r.byNumber.get(60)).toEqual([
      { kind: "image", url: "/question-media/bcs-mental/problem-solving/custom-60.webp", alt: "ঘনকের জাল" },
    ]);
    expect(existsSync(join(publicRoot, "bcs-mental/problem-solving/custom-60.webp"))).toBe(true);
  });

  it("warns on duplicate numbers and missing sidecar files", () => {
    const { sourceDir, publicRoot } = makeTree();
    const figDir = join(sourceDir, "Questions[x].figures");
    mkdirSync(figDir);
    writeFileSync(join(figDir, "q014.png"), "a");
    writeFileSync(join(figDir, "q014.jpg"), "b");
    writeFileSync(join(figDir, "notes.txt"), "c");
    writeFileSync(
      join(sourceDir, "Questions[x].figures.json"),
      JSON.stringify({ 99: [{ file: "missing.png" }] }),
    );

    const r = resolveFigureMedia({ sourceDir, stem: "Questions[x]", slug: "bcs-mental/problem-solving", publicRoot });

    expect(r.byNumber.has(14)).toBe(true);
    expect(r.byNumber.has(99)).toBe(false);
    expect(r.warnings.some((w) => w.includes("duplicate figure for #14"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("missing.png"))).toBe(true);
    // non-image files are ignored silently (README/.DS_Store noise)
    expect(r.warnings.some((w) => w.includes("notes.txt"))).toBe(false);
  });

  it("does not write to public when copy is disabled", () => {
    const { sourceDir, publicRoot } = makeTree();
    const figDir = join(sourceDir, "Questions[x].figures");
    mkdirSync(figDir);
    writeFileSync(join(figDir, "q001.png"), "a");

    const r = resolveFigureMedia({
      sourceDir,
      stem: "Questions[x]",
      slug: "bcs-mental/problem-solving",
      publicRoot,
      copy: false,
    });

    expect(r.copied).toBe(0);
    expect(existsSync(join(publicRoot, "bcs-mental/problem-solving/q001.png"))).toBe(false);
    // url is still emitted; the missing-file warning tells the operator to sync
    expect(r.byNumber.get(1)?.[0].url).toBe("/question-media/bcs-mental/problem-solving/q001.png");
    expect(r.warnings.some((w) => w.includes("is not under public/"))).toBe(true);
  });
});
