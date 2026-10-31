/**
 * scripts/media-attachments.ts
 * ----------------------------------------------------------------------------
 * Question-level figure attachments (`Question.media`).
 *
 * Source layout — one folder + optional sidecar per source file, kept beside
 * the `.txt` so record numbers never collide across files:
 *
 *   database/data/ques/Mental Ablity/
 *   ├── Questions[সমস্যা সমাধান (Problem Solving)].txt
 *   ├── Questions[সমস্যা সমাধান (Problem Solving)].figures.json   (optional)
 *   └── Questions[সমস্যা সমাধান (Problem Solving)].figures/
 *       ├── q014.png
 *       └── q052.png
 *
 * Any `q<n>.<ext>` file in the figures folder attaches to record `n`. The
 * sidecar overrides or adds entries for a number:
 *
 *   { "14":  "/question-media/bcs-mental/problem-solving/q014.png",
 *     "52":  [{ "kind": "image", "url": "…/q052.png", "alt": "চিত্র ১" }],
 *     "60":  [{ "file": "custom-60.webp", "alt": "ঘনকের জাল" }] }
 *
 * Local files are copied into `public/question-media/<slug>/` (URLs only in
 * the DB — never base64) and referenced as `/question-media/<slug>/<name>`.
 * Sidecar `url` values are used verbatim, so hand-managed assets still work.
 *
 * Pure helpers are exported for unit tests; `resolveFigureMedia` is the only
 * function that touches the filesystem.
 * ----------------------------------------------------------------------------
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { join, dirname } from "path";

export type MediaEntry = { kind: "image"; url: string; alt?: string };

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"] as const;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Bengali digits → Latin digits, everything else untouched. */
export function bnDigitsToLatin(s: string): string {
  return [...s].map((c) => {
    const i = BN_DIGITS.indexOf(c);
    return i >= 0 ? String(i) : c;
  }).join("");
}

/** Normalize `"014"`, `"১৪"`, `14` to the record number 14. */
export function numberKey(raw: string | number): number | null {
  const n = Number(bnDigitsToLatin(String(raw).trim()));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `q014.png` → 14. Returns null for files that are not `q<number>.<ext>`. */
export function figureNumberFromName(fileName: string): number | null {
  const m = fileName.match(/^q([০-৯0-9]+)\.[A-Za-z0-9]+$/);
  return m ? numberKey(m[1]) : null;
}

export function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Coerce one sidecar value into media entries. Accepts a bare URL string, a
 * single entry, or an array of entries. Entries without a usable `url` or
 * `file` are dropped.
 */
export function normalizeMediaValue(value: unknown): { entries: MediaEntry[]; files: { file: string; alt?: string }[] } {
  const entries: MediaEntry[] = [];
  const files: { file: string; alt?: string }[] = [];
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    if (typeof item === "string") {
      const url = item.trim();
      if (url) entries.push({ kind: "image", url });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const alt = typeof rec.alt === "string" && rec.alt.trim() ? rec.alt.trim() : undefined;
    if (typeof rec.file === "string" && rec.file.trim()) {
      files.push(alt ? { file: rec.file.trim(), alt } : { file: rec.file.trim() });
      continue;
    }
    if (typeof rec.url === "string" && rec.url.trim()) {
      entries.push(alt ? { kind: "image", url: rec.url.trim(), alt } : { kind: "image", url: rec.url.trim() });
    }
  }
  return { entries, files };
}

/** Parse a `.figures.json` sidecar body into number → entries. Pure. */
export function parseFiguresSidecar(raw: unknown): Map<number, { entries: MediaEntry[]; files: { file: string; alt?: string }[] }> {
  const out = new Map<number, { entries: MediaEntry[]; files: { file: string; alt?: string }[] }>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = numberKey(key);
    if (n === null) continue;
    const { entries, files } = normalizeMediaValue(value);
    if (entries.length === 0 && files.length === 0) continue;
    out.set(n, { entries, files });
  }
  return out;
}

export type FigureMediaOptions = {
  /** Directory holding the source `.txt` (and its `.figures/` + sidecar). */
  sourceDir: string;
  /** Source file name without extension; also the public sub-folder name. */
  stem: string;
  /** Public sub-folder, e.g. `bcs-mental/problem-solving`. */
  slug: string;
  /** Absolute `public/question-media` root. Defaults to `<cwd>/public/question-media`. */
  publicRoot?: string;
  /** Copy local files into public. Defaults to true. */
  copy?: boolean;
};

export type FigureMediaResult = {
  /** Record number → media entries ready for `Question.media`. */
  byNumber: Map<number, MediaEntry[]>;
  /** Non-fatal problems worth surfacing in the import log. */
  warnings: string[];
  /** Number of files (re)copied into public. */
  copied: number;
};

/**
 * Resolve figures for one source file. Missing figures folder or sidecar is
 * not an error — it simply yields no attachments.
 */
export function resolveFigureMedia(opts: FigureMediaOptions): FigureMediaResult {
  const publicRoot = opts.publicRoot ?? join(process.cwd(), "public", "question-media");
  const figuresDir = join(opts.sourceDir, `${opts.stem}.figures`);
  const sidecarPath = join(opts.sourceDir, `${opts.stem}.figures.json`);
  const publicDir = join(publicRoot, opts.slug);
  const urlBase = `/question-media/${opts.slug}`;
  const result: FigureMediaResult = { byNumber: new Map(), warnings: [], copied: 0 };
  const doCopy = opts.copy !== false;

  const sidecar = existsSync(sidecarPath)
    ? parseFiguresSidecar(JSON.parse(readFileSync(sidecarPath, "utf8")))
    : new Map<number, { entries: MediaEntry[]; files: { file: string; alt?: string }[] }>();

  if (existsSync(figuresDir)) {
    const files = readdirSync(figuresDir).filter(isImageFile).sort();
    for (const fileName of files) {
      const n = figureNumberFromName(fileName);
      if (n === null) {
        result.warnings.push(`ignored ${fileName} — expected q<number>.<ext>`);
        continue;
      }
      if (result.byNumber.has(n)) {
        result.warnings.push(`duplicate figure for #${n}: ${fileName} ignored`);
        continue;
      }
      if (sidecar.has(n)) continue; // sidecar wins
      const entry = attachLocalFile(join(figuresDir, fileName), fileName, publicDir, urlBase, doCopy);
      if (!entry) {
        result.warnings.push(`could not read ${fileName}`);
        continue;
      }
      if (doCopy) result.copied++;
      result.byNumber.set(n, [entry]);
    }
  }

  for (const [n, { entries, files }] of sidecar) {
    const merged: MediaEntry[] = [...entries];
    for (const f of files) {
      const entry = attachLocalFile(join(figuresDir, f.file), f.file, publicDir, urlBase, doCopy, f.alt);
      if (!entry) {
        result.warnings.push(`#${n}: sidecar file not found — ${f.file}`);
        continue;
      }
      if (doCopy) result.copied++;
      merged.push(entry);
    }
    if (merged.length > 0) result.byNumber.set(n, merged);
  }

  for (const [n, entries] of result.byNumber) {
    for (const e of entries) {
      if (!e.url.startsWith("/") || e.url.startsWith("//")) continue;
      const rel = decodeURIComponent(e.url.replace(/^\//, "").split("?")[0]);
      const abs = join(dirname(publicRoot), rel);
      if (!existsSync(abs)) result.warnings.push(`#${n}: ${e.url} is not under public/`);
    }
  }

  return result;
}

function attachLocalFile(
  sourcePath: string,
  fileName: string,
  publicDir: string,
  urlBase: string,
  doCopy: boolean,
  alt?: string,
): MediaEntry | null {
  if (!existsSync(sourcePath)) return null;
  if (doCopy) {
    mkdirSync(publicDir, { recursive: true });
    const dest = join(publicDir, fileName);
    if (needsCopy(sourcePath, dest)) copyFileSync(sourcePath, dest);
  }
  const url = `${urlBase}/${encodeURIComponent(fileName)}`;
  return alt ? { kind: "image", url, alt } : { kind: "image", url };
}

function needsCopy(source: string, dest: string): boolean {
  if (!existsSync(dest)) return true;
  const a = statSync(source);
  const b = statSync(dest);
  return a.size !== b.size || Math.floor(a.mtimeMs) > Math.floor(b.mtimeMs);
}
