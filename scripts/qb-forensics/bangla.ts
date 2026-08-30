/**
 * scripts/qb-forensics/bangla.ts
 * ----------------------------------------------------------------------------
 * Bangla-specific detection and candidate generation for the forensic audit.
 *
 * The question bank contains a specific, well-characterized corruption mode:
 * text that was laid out in *visual order* (as it appeared on a PDF page) and
 * then captured as a character stream. In logical Unicode order the pre-base
 * vowel signs (`ি`, `ে`, `ৈ`, `ো`, `ৌ`) MUST follow their base consonant, and
 * the `র্` mark (ra-phala) must stay attached to the consonant cluster. The
 * corrupted streams instead place them at odd positions and inject spaces
 * inside clusters (e.g. "সংঘষ র্", "দ িট", "েকান").
 *
 * IMPORTANT: this corruption is NOT a reversible pure transform — the same
 * mangled stream can be produced from several logical forms (e.g. "দ িট" is
 * "দিট" but "পরিবত" needs no space). So `deshapeCandidate()` only produces a
 * *candidate* for human review / clean-source cross-validation. It is never
 * applied automatically. Classification (HIGH/MEDIUM/LOW) lives in
 * `issues.ts` / `normalize.ts`.
 * ----------------------------------------------------------------------------
 */

export const BANGLA_ASSAMESE = "অআইঈউঊঋএঐওঔ";
export const BANGLA_CONSONANTS = "কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহয়ড়ঢ়";
export const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Codes of dependent vowel signs stored AFTER the base in logical order. */
export const DEPENDENT_VOWELS = "ািীুূৃেৈোৌৗ";
/** Signs that PRE-base in the visual layout (rendered left of the stem). */
export const PREBASE_MARKS = "িেৈোৌ";
/** Signs that render POST-base. */
export const POSTBASE_MARKS = "ািীুূৃৗ";
/** Everything that can legally follow a base letter in Bangla. */
export const ATTACHING_MARKS = "ািীুূৃেৈোৌ্ৗংঃঁ";

const IS_BASE = new Set<string>([...BANGLA_ASSAMESE, ...BANGLA_CONSONANTS]);
const IS_PREBASE = new Set<string>([...PREBASE_MARKS]);
const IS_MARK = new Set<string>([...ATTACHING_MARKS]);

/** Detect whether `text` exhibits the visual-order / cluster-break corruption signature. */
export function hasMangleSignature(s: string): boolean {
  if (!/[ক-হয়ড়ঢ়অ-ঔ]/.test(s)) return false;
  // A pre-base mark at a word boundary can never follow a base letter there,
  // so it is unmistakably a visual-order artifact.
  const prebaseAtWordStart = new RegExp(`(^|[\\s(:{])[${PREBASE_MARKS}]`).test(s);
  // A hung (space-separated) ra-phala or hasanta-split conjunct.
  const loosenedRa = /[ক-হয়ড়ঢ়]\sর্/.test(s) || /\sর্\s/.test(s);
  const looseHasanta = /্\s(?=[ক-হয়ড়ঢ়অ-ঔ])/.test(s);
  // A post-base mark immediately followed by a pre-base mark. This sequence is
  // invalid in correct Bangla (they would NFC-compose, e.g. ে+া -> ো), so a
  // raw "াে"/"িে"/"ুে"... indicates visual-order corruption such as "এখােন".
  const invertedVowelOrder = /[\u09BE\u09BF\u09C0\u09C1\u09C2\u09C3][\u09C7\u09C8\u09CB\u09CC]/.test(s);
  return prebaseAtWordStart || loosenedRa || looseHasanta || invertedVowelOrder;
}

/** Detect the unmistakable mangled "ব্যাখ্যা" header (বয্াখয্া and friends). */
export function hasMangledHeader(s: string): boolean {
  return /বযাখ্যা|বয্াখয্া|বযাখয্া/.test(s);
}

/** Detect any stray multi-question scaffold leaking into a single field. */
export function hasOptionMarkers(s: string): boolean {
  return /\((ক|খ|গ|ঘ|ঙ|চ)\)/.test(s);
}

export function hasExplicationMarker(s: string): boolean {
  return /উত্তর|ব্যাখ্যা|বযাখ্যা/.test(s);
}

/**
 * Remove word-boundary spaces that are unmistakably artifacts:
 *  - space immediately followed by a Bangla attaching mark (দ িট, সং ঘষ)
 *  - space before a standalone `র্` (loosened ra-phala) or after an attaching mark
 * Keeps real inter-word spaces.
 */
export function stripSpuriousSpaces(s: string): string {
  return s
    .replace(new RegExp(`\\s(?=[${ATTACHING_MARKS}])`, "g"), "")
    .replace(/\s(?=র্)/g, "")
    .replace(/র্\s/g, "র্")
    .replace(new RegExp(`[${ATTACHING_MARKS}]\\s`, "g"), (m) => m[0]);
}

/**
 * Convert one logical-order token (already de-spaced) so that pre-base marks
 * sit after their cluster. Keeps conjunct clusters (base+্+base) intact and
 * appends pending pre-base marks immediately before post-base marks so that
 * `ে` + `া` NFC-compose to `ো`.
 */
export function reorderToken(token: string): string {
  const chars = [...token];
  const pending: string[] = []; // pre-base marks seen before their base cluster
  let out = "";

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (IS_PREBASE.has(ch)) {
      pending.push(ch);
      continue;
    }
    if (IS_MARK.has(ch)) {
      out += pending.join("") + ch;
      pending.length = 0;
      continue;
    }

    // Base consonant: consume a conjunct (base ্ base) chain.
    if (IS_BASE.has(ch)) {
      let j = i;
      let cluster = ch;
      // swallow ্ + base pairs
      while (j + 2 < chars.length && chars[j + 1] === "\u09CD" && IS_BASE.has(chars[j + 2])) {
        cluster += "\u09CD" + chars[j + 2];
        j += 2;
      }
      // trailing attaches (post-base marks / ্ / anusvara / candra)
      let k = j + 1;
      while (k < chars.length && IS_MARK.has(chars[k]) && !IS_PREBASE.has(chars[k])) {
        cluster += chars[k];
        k++;
      }
      i = k - 1;
      out += cluster + pending.join("");
      pending.length = 0;
      continue;
    }

    out += pending.join("") + ch;
    pending.length = 0;
  }
  return out + pending.join("");
}

/**
 * Produce a plausible logical-order reconstruction of a mangled string.
 * This is a CANDIDATE ONLY — see header note.
 * 1. strip artifact spaces
 * 2. split into tokens on NORMAL (kept) spaces
 * 3. reorder each token
 */
export function deshapeCandidate(s: string): string {
  const deSpaced = stripSpuriousSpaces(s);
  const tokens = deSpaced.split(/\s+/).filter(Boolean);
  return tokens.map((t) => reorderToken(t)).join(" ").normalize("NFC");
}

/** True when a field looks like run-of-the-mill OCR garbage (mismatched Latin / control mix). */
export function looksLikeGarbage(s: string): boolean {
  return hasReplacementChars(s) || /[ÃÂ]*â€[™"˜\u0093\u0094]/.test(s);
}

import { hasReplacementChar } from "./unicode";

function hasReplacementChars(s: string): boolean {
  return hasReplacementChar(s);
}