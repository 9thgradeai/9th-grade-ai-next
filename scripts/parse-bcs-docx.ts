/**
 * scripts/parse-bcs-docx.ts
 * ----------------------------------------------------------------------------
 * Parses the BCS Previous-Year .docx papers under
 * database/data/question_bank/bcs/ into RawBcsRecord JSON
 * (database/data/question_bank/bcs/bcs_docx_papers.json), which
 * scripts/import-bcs-exams.ts then imports through the standard validated
 * pipeline (import gate + exam taxonomy + idempotent upserts).
 *
 * The .docx files use several layouts:
 *   44th: one paragraph per MCQ (Q + inline options + answer + explanation)
 *   46th: four paragraphs per MCQ (Q / inline options / answer / explanation)
 *   48th: four paragraphs per MCQ ("উত্তর:" answer marker)
 *   49th: scattered paragraphs (each option on its own line; options may come
 *         AFTER the answer/explanation lines)
 *   50th: Q + one-line-per-option + combined "সঠিক উত্তর: …। ব্যাখ্যা: …" line
 *
 * Text is taken byte-identical from word/document.xml (already unicode
 * optimized per the donor) — this script only re-chunks it into records.
 * Subject assignment is keyword-based (classifyBcsSubject); records whose
 * answer cannot be resolved, that lack an explanation, or that fail the
 * shared import gate are REPORTED by the importer — never fabricated.
 *
 * Run:
 *   npx tsx scripts/parse-bcs-docx.ts            (writes bcs_docx_papers.json)
 *   npx tsx scripts/parse-bcs-docx.ts --dry-run  (parse + report only)
 * ----------------------------------------------------------------------------
 */
import { execFileSync } from "child_process"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import type { RawBcsRecord } from "./import-bcs-exams"

const BCS_DIR = join(process.cwd(), "database", "data", "question_bank", "bcs")
const OUT_FILE = join(BCS_DIR, "bcs_docx_papers.json")

// file → BCS term number.
const DOCX_TERMS: Array<{ file: string; examNum: number }> = [
  { file: "44th BCS.docx", examNum: 44 },
  { file: "46th BCS.docx", examNum: 46 },
  { file: "47th BCS.docx", examNum: 47 },
  { file: "48th BCS.docx", examNum: 48 },
  { file: "৪৯তম বিসিএস (49th BCS).docx", examNum: 49 },
  { file: "50th BCS.docx", examNum: 50 },
]

const BN_DIGITS = "০১২৩৪৫৬৭৮৯"
export const enDigitsToBn = (n: number) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)])

/** Extract raw paragraph texts from a .docx (zip + document.xml, no deps). */
export function extractDocxParagraphs(docxPath: string): string[] {
  const xml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  })
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
  const decodeXml = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      // &amp; LAST — the others introduce no new ampersands.
      .replace(/&amp;/g, "&")
  return paras.map((p) => {
    const runs = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []
    return decodeXml(runs.map((r) => r.replace(/<[^>]+>/g, "")).join(""))
      .replace(/\s+/g, " ")
      .trim()
  })
}

const RECORD_START =
  /^\s*(?:প্রশ্ন\s*)?([0-9\u09E6-\u09EF\u06F0-\u06F9]+)\s*(?:\([কখগঘa-dA-D]\)\s*)?[.।]\s*(.*)$/

/** Group paragraphs into per-question records. */
export function splitDocxRecords(paras: string[]): string[][] {
  const records: string[][] = []
  let current: string[] | null = null
  for (const p of paras) {
    if (!p) continue
    // A bare "N)" line is an option, never a record start.
    if (/^\s*[0-9\u09E6-\u09EF\u06F0-\u06F9]+\s*\)/.test(p)) {
      if (current) current.push(p)
      continue
    }
    const m = RECORD_START.exec(p)
    if (m) {
      if (current) records.push(current)
      current = [p]
    } else if (current) {
      current.push(p)
    }
    // Preamble lines before the first record (titles) are skipped.
  }
  if (current) records.push(current)
  return records
}

// ── Option splitting ────────────────────────────────────────────────────
const MARKER_RE = /\(?\s*([কখগঘa-dA-D])\s*\)?\s*[).:]\s*/g
const BN_ORDER = ["ক", "খ", "গ", "ঘ"]
const LATIN_ORDER = ["a", "b", "c", "d"]

type Marker = { letter: string; start: number; end: number }

function findMarkers(text: string): Marker[] {
  const out: Marker[] = []
  MARKER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKER_RE.exec(text)) !== null) {
    out.push({ letter: m[1], start: m.index, end: m.index + m[0].length })
  }
  return out
}

/**
 * Split inline "…stem (ক) o1 (খ) o2 (গ) o3 (ঘ) o4" text.
 *
 * Marker letters can ALSO occur inside prose ("গ.সা.গু", "A. W. B. Yeats"),
 * so the first occurrence of each letter is not always the option block.
 * Strategy: enumerate one-per-letter combinations (ordered ক→খ→গ→ঘ first,
 * then any order for sources that print options out of order) by increasing
 * span and take the first combination with non-empty slices. Ordered-first is
 * what defeats prose markers ("গ.সা.গু" precedes the real block, so any
 * combination using it is unordered and loses); minimal-span prefers the real
 * tight option block over scattered prose markers. Residual misalignments are
 * the import gate's job (OPTION_MARKER_LEAK), never silently imported.
 *
 * The returned array is always letter-ordered ([ক,খ,গ,ঘ]) so letter→index
 * answer resolution stays correct even for out-of-order sources
 * ("(ক) … (গ) … (খ) … (ঘ) …").
 */
export function splitInlineOptions(text: string): { stem: string; options: string[] } | null {
  const markers = findMarkers(text)
  if (markers.length < 4) return null
  for (const order of [BN_ORDER, LATIN_ORDER]) {
    const isBn = order === BN_ORDER
    const keyOf = (letter: string) => (isBn ? letter : letter.toLowerCase())
    const perLetter = new Map<string, Marker[]>()
    for (const mk of markers) {
      const isMine = isBn ? /[কখগঘ]/.test(mk.letter) : /[a-dA-D]/.test(mk.letter)
      if (!isMine) continue
      const k = keyOf(mk.letter)
      if (!perLetter.has(k)) perLetter.set(k, [])
      perLetter.get(k)!.push(mk)
    }
    if (!order.every((L) => (perLetter.get(L) ?? []).length > 0)) continue
    // Bound the search: prose-heavy lines fall back to first occurrences.
    const lists = order.map((L) => perLetter.get(L)!)
    if (lists.some((l) => l.length > 8)) continue
    const combos: Marker[][] = []
    const build = (depth: number, acc: Marker[]) => {
      if (combos.length > 2000) return
      if (depth === 4) {
        combos.push([...acc])
        return
      }
      for (const mk of lists[depth]) {
        acc.push(mk)
        build(depth + 1, acc)
        acc.pop()
      }
    }
    build(0, [])
    const span = (c: Marker[][][number]) =>
      Math.max(...c.map((m) => m.start)) - Math.min(...c.map((m) => m.start))
    const inOrder = (c: Marker[]) =>
      c[0].start < c[1].start && c[1].start < c[2].start && c[2].start < c[3].start
    combos.sort((a, b) => Number(inOrder(b)) - Number(inOrder(a)) || span(a) - span(b))
    for (const combo of combos) {
      const sorted = [...combo].sort((a, b) => a.start - b.start)
      const textByLetter = new Map<string, string>()
      sorted.forEach((mk, i) => {
        textByLetter.set(
          keyOf(mk.letter),
          text.slice(mk.end, i < sorted.length - 1 ? sorted[i + 1].start : undefined).trim()
        )
      })
      const options = order.map((L) => textByLetter.get(L) ?? "")
      if (!options.every((o) => o.length > 0)) continue
      // The stem may be empty for option-only lines (multi-paragraph layout);
      // the caller owns the question text in that case.
      return { stem: text.slice(0, sorted[0].start).trim(), options }
    }
  }
  return null
}

const SINGLE_OPTION_LINE = /^\s*\(?\s*[কখগঘa-dA-D]\s*\)?\s*[).:]\s*\S/
const ANSWER_RE = /(সঠিক উত্তর|উত্তর)\s*:/
const EXPL_RE = /ব্যাখ্যা\s*:|Explanation\s*:/

export type ParsedDocxQuestion = {
  qnum: number | null
  question: string
  options: string[]
  correctAnswer: string
  explanation: string
}

function stripQnumPrefix(text: string): { qnum: number | null; rest: string } {
  const m =
    /^\s*(?:প্রশ্ন\s*)?([0-9\u09E6-\u09EF\u06F0-\u06F9]+)\s*(?:\([কখগঘa-dA-D]\)\s*)?[.।]\s*([\s\S]*)$/.exec(
      text
    )
  if (!m) return { qnum: null, rest: text.trim() }
  const bnToEn = (s: string) =>
    s.replace(/[\u09E6-\u09EF\u06F0-\u06F9]/g, (d) => {
      const c = d.charCodeAt(0)
      return String(c >= 0x09e6 ? c - 0x09e6 : c - 0x06f0)
    })
  const qnum = Number(bnToEn(m[1]))
  return { qnum: Number.isFinite(qnum) ? qnum : null, rest: m[2].trim() }
}

/** Parse one record's lines into question/options/answer/explanation. */
export function parseDocxRecord(lines: string[]): ParsedDocxQuestion | null {
  if (lines.length === 0) return null
  const joined = lines.join("\n")

  // Explanation: tail after ব্যাখ্যা:/Explanation: plus following non-option
  // lines. (49th scattered layout: option lines AFTER the explanation belong
  // to the options, collected separately in document order.) Stops at a
  // SECOND answer marker — donor paste glitches occasionally leave the NEXT
  // record's answer block inside this record (47th #73 carries #74's answer);
  // orphan lines are dropped, never reattached positionally. Exact-duplicate
  // consecutive lines are collapsed (donor paste duplication, 47th #76 ×20).
  let explanation = ""
  let trailingOptions: string[] = []
  const explIdx = joined.search(EXPL_RE)
  let headArea = joined
  if (explIdx >= 0) {
    const tail = joined.slice(explIdx).replace(EXPL_RE, "")
    const tailLines = tail.split("\n")
    const explParts: string[] = [(tailLines[0] ?? "").trim()]
    let seenOption = false
    let cut = false
    for (const tl of tailLines.slice(1)) {
      if (!cut && ANSWER_RE.test(tl)) {
        cut = true
        continue
      }
      if (cut) continue
      if (SINGLE_OPTION_LINE.test(tl)) seenOption = true
      if (seenOption && SINGLE_OPTION_LINE.test(tl)) trailingOptions.push(tl.trim())
      else if (tl.trim()) explParts.push(tl.trim())
    }
    const deduped: string[] = []
    for (const part of explParts) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== part) deduped.push(part)
    }
    explanation = deduped.join(" ").replace(/\s+/g, " ").trim()
    headArea = joined.slice(0, explIdx)
  }

  // Answer: text after the answer marker (within the pre-explanation area).
  let correctAnswer = ""
  let head = headArea
  const ansM = ANSWER_RE.exec(headArea)
  if (ansM) {
    correctAnswer = headArea
      .slice(ansM.index + ansM[0].length)
      .replace(/\s+/g, " ")
      .trim()
    head = headArea.slice(0, ansM.index)
  }

  const headLines = head
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  if (headLines.length === 0) return null

  const { qnum, rest: firstRest } = stripQnumPrefix(headLines[0])

  // Collect options: inline splits first, then single-option lines in order.
  let options: string[] = []
  let question = firstRest
  const inlineFirst = splitInlineOptions(firstRest)
  if (inlineFirst && inlineFirst.options.length === 4) {
    question = inlineFirst.stem
    options = inlineFirst.options
  } else {
    for (const hl of headLines.slice(1)) {
      const inline = splitInlineOptions(hl)
      if (inline && inline.options.length === 4) {
        options.push(...inline.options)
        continue
      }
      if (SINGLE_OPTION_LINE.test(hl)) {
        options.push(hl.replace(/^\s*\(?\s*[কখগঘa-dA-D]\s*\)?\s*[).:]\s*/, "").trim() || hl.trim())
      }
    }
    // A single-option first line (49th "ক) ২" style never leads, but be safe).
    if (options.length === 0) {
      const inline = splitInlineOptions(headLines.slice(1).join(" "))
      if (inline && inline.options.length === 4) options = inline.options
    }
  }
  // Options that trailed the explanation (49th scattered layout).
  for (const tl of trailingOptions) {
    options.push(tl.replace(/^\s*\(?\s*[কখগঘa-dA-D]\s*\)?\s*[).:]\s*/, "").trim() || tl.trim())
  }

  // Strip any single-option marker prefix remnants from inline-split options.
  options = options.map((o) => o.trim()).filter(Boolean)
  if (options.length !== 4) return null
  question = question.replace(/\s+/g, " ").trim()
  if (!question) return null
  return { qnum, question, options, correctAnswer, explanation }
}

// ── Subject classification (BCS 10-subject taxonomy) ────────────────────
// Priority + script-awareness matter more than keyword volume:
//   • ACRONYMS match UPPERCASE ONLY (case-sensitive). With /i, WHO fires on
//     the English pronoun "who", UK on "book", OIC on "choice", MAN on "man",
//     ROM on "from"-adjacent… — every English question misfiled as
//     International/ICT. Real acronyms in these papers are always uppercase.
//   • Bare technical nouns get \b boundaries (bit/bite, cell/excellent,
//     heat/cheat, map/champion, log/dialogue, union/reunion).
//   • English GRAMMAR mechanics are checked before Bangla: an English stem
//     ("What kind of noun is 'river'?") is never a Bangla-section question,
//     and Bangla explanations must not drag English stems into Bangla.
//     Conversely the Bangla family only fires on Bangla-heavy stems.
const has = (re: RegExp, t: string) => re.test(t)
// Uppercase-only acronyms (NO /i flag) — see note above.
const ICT_ACRONYM_RE = /\b(MAN|HTML|WWW|LAN|WAN|PAN|CPU|RAM|ROM|AI)\b/
const INTL_ACRONYM_RE = /\b(WHO|UNESCO|SAARC|OIC|NATO|IMF|UK|USA|UN)\b/
const SCIENCE_ACRONYM_RE = /\bDNA\b/

const ICT_RE =
  /computer|software|hardware|internet|e-?mail|network|নেটওয়ার্ক|website|ওয়েব|digital|ডিজিটাল|binary|বাইনারি|hexa|হেক্সা|cloud|ক্লাউড|keyboard|mouse|monitor|Mbps|bandwidth|ব্যান্ডউইথ|hyper-?link|robot|রোবট|কম্পিউটার|সফটওয়্যার|হার্ডওয়্যার|ইন্টারনেট|সাইবার|cyber|hack|হ্যাক|database|ডেটাবেজ|ডাটাবেজ|ডাটাবেস|malware|প্রোগ্রাম|program|\bbits?\b|\bbytes?\b|\bpixels?\b|printer|প্রিন্টার|fiber|ফাইবার|satellite|স্যাটেলাইট|modem|মডেম|router|রাউটার|server|সার্ভার|password|পাসওয়ার্ড|e-commerce|ই-কমার্স|facebook|ফেসবুক|google|গুগল|microsoft|কৃত্রিম বুদ্ধিমত্তা|artificial intelligence|Face Recognition|তথ্য প্রযুক্তি/i
const MATH_RE =
  /শতকরা|percent|গড়|average|সুদ|interest|মুনাফা|লাভ|ক্ষতি|profit|loss|ছাড়|discount|অনুপাত|ratio|সমীকরণ|equation|ত্রিভুজ|triangle|বৃত্ত|circle|বর্গক্ষেত্র|square|ক্ষেত্রফল|area|পরিসীমা|perimeter|ব্যাস|diameter|ব্যাসার্ধ|radius|গ\.সা\.গু|ল\.সা\.গু|ভগ্নাংশ|fraction|দশমিক|decimal|বর্গমূল|square root|সূচক|logarithm|দূরত্ব|distance|গতি|speed|ট্রেন|train|স্রোতের বেগ|অনুকূলে|প্রতিকূলে|নৌকা.{0,40}স্রোত|স্রোত.{0,40}নৌকা|নৌকার বেগ|স্থির পানি|বয়স|ages|mixture|coins?|dice|wheel|revolution|probability|সম্ভাবনা|perimeter|rectangle|[0-9\u09E6-\u09EF\u06F0-\u06F9]\s*°|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞½⁄]|0x[0-9a-fA-F]+|সংখ্যাগুলির গড়|গড় বিচ্যুতি|\blog\b/i
const MENTAL_RE =
  /রক্তের সম্পর্ক|blood relation|সাংকেতিক|কোড ভাষা|\bcode\b|সাদৃশ্য|analogy|ব্যতিক্রম|odd one|দিক নির্ণয়|দিক\.|ঘড়ি|clock|আয়না|mirror|প্রতিবিম্ব|ক্যালেন্ডার|calendar|পাশা|dice|syllogism|ন্যায়|সিদ্ধান্ত|conclusion|venn|ভেন|বর্ণমালা|alphabet.*series|ধারার পরবর্তী|পরবর্তী সংখ্যা|number series|letter series|statement.*conclusion|direction sense/i
const BANGLA_RE =
  /সাহিত্য|কবি|লেখক|উপন্যাস|গল্প|নাটক|কাব্য|কবিতা|পত্রিকা|ছন্দ|রবীন্দ্র|নজরুল|বিদ্যাসাগর|বঙ্কিম|শরৎ|মধুসূদন|জসীম|ফররুখ|ব্যাকরণ|ধ্বনি|বর্ণ|সন্ধি|সমাস|কারক|বাচ্য|উপসর্গ|প্রত্যয়|বানান|এককথায়|বাগধারা|প্রবাদ|বিভক্তি|সমার্থক|বিপরীতার্থক|শুদ্ধ বাক্য|অলংকার|অপহ্নতি|যমক|চর্যাপদ|মঙ্গলকাব্য|শ্রীকৃষ্ণকীর্তন|বিদ্যাপতি|চণ্ডীদাস|ভানুসিংহ|তৎসম|তদ্ভব|ধাতু|বাক্য|বিভক্তি|ণত্ব|ষত্ব|যৌগিক|সরল বাক্য|জটিল বাক্য|বর্ণ বিপর্যয়|কোন ভাষা থেকে আগত|শব্দের অর্থ|শব্দ(?!ের বেগ|দূষণ| ?তরঙ্গ)|বিশেষ্য|বিশেষণ|সর্বনাম|অব্যয়|যোজক|দ্বিরুক্ত|উচ্চারণ|চাঁদের অমাবস্যা|আনোয়ারা|অর্ধচন্দ্র|হরতাল|জিগীষা|মৃত্তিকা|যথারীতি|চণ্ডীমঙ্গল/i
const ETHICS_RE =
  /নৈতিকতা|মূল্যবোধ|সু-?শাসন|ethics|good governance|সততা|integrity|জবাবদিহি|accountability|স্বচ্ছতা|transparency|দুর্নীতি|corruption/i
const GEO_RE =
  /নদী|river|পর্বত|mountain|সাগর|মহাসাগর|ocean|জলবায়ু|climate|পরিবেশ|environment|দুর্যোগ|disaster|ঘূর্ণিঝড়|বন্যা|খরা|ভূমিকম্প|সুনামি|মরুভূমি|desert|অক্ষাংশ|latitude|দ্রাঘিমাংশ|longitude|মানচিত্র|\bmaps?\b|দীর্ঘতম|বৃহত্তম|হিমালয়|himalaya|everest|এভারেস্ট|ভূগোল|geography/i
const SCIENCE_RE =
  /বিজ্ঞান|science|অক্সিজেন|oxygen|হাইড্রোজেন|hydrogen|কোষ|\bcells?\b|রক্ত|blood|ভিটামিন|vitamin|প্রোটিন|protein|শক্তি|energy|আলো|\blights?\b|শব্দের বেগ|শব্দদূষণ|শব্দতরঙ্গ|শব্দ তরঙ্গ|sound|তাপ|\bheats?\b|চুম্বক|magnet|বিদ্যুৎ|electric|পরমাণু|atom|অণু|molecule|রসায়ন|chemistry|পদার্থ|physics|জীব|\bplants?\b|উদ্ভিদ|প্রাণী|animal|রোগ|disease|টিকা|vaccine|ডিএনএ|ভাইরাস|virus|corona|acid|অ্যাসিড|ক্ষার|ধাতব|জারণ|সালোকসংশ্লেষণ|photosynthesis/i
const INTL_RE =
  /জাতিসংঘ|জাতিপুঞ্জ|united nations|আন্তর্জাতিক|international|যুক্তরাষ্ট্র|america|যুক্তরাজ্য|britain|চীন|china|ভারত|india|রাশিয়া|russia|জাপান|japan|ফ্রান্স|france|জার্মানি|germany|বিশ্বযুদ্ধ|world war|স্নায়ুযুদ্ধ|cold war|বৈদেশিক|foreign|কূটনীতি|diplomacy|রাষ্ট্রদূত|ambassador|নোবেল|nobel|অলিম্পিক|olympic|বিশ্বকাপ|world cup|মুদ্রা তহবিল|বিশ্বব্যাংক|world bank|ইউরোপীয়|european|আরব|arab|ফিলিস্তিন|palestine|ইসরায়েল|israel|ইউক্রেন|ukraine/i
const BD_RE =
  /বাংলাদেশ|bangladesh|মুক্তিযুদ্ধ|liberation war|বঙ্গবন্ধু|bangabandhu|সংবিধান|constitution|জাতীয় সংসদ|parliament|ঢাকা|dhaka|পদ্মা সেতু|padma bridge|মেট্রোরেল|metro rail|উপজেলা|upazila|ইউনিয়ন পরিষদ|\bunion\b|পৌরসভা|municipality|স্থানীয় সরকার|local government|জেলা|district|বিভাগ|division|ভাষা আন্দোলন|language movement|একুশে|স্বাধীনতা|independence|বিজয় দিবস|victory day|সিটি কর্পোরেশন|city corporation|শেখ হাসিনা|জিয়াউর|এরশাদ|সাতই মার্চ|7th march|গণপ্রজাতন্ত্রী|republic|সচিবালয়|secretariat|নির্বাচন কমিশন|election commission|তত্ত্বাবধায়ক|caretaker|বাজেট|budget|অর্থনৈতিক সমীক্ষা|economic review|আদমশুমারি|census|বীরশ্রেষ্ঠ|bir shrestha|সেক্টর কমান্ডার|sector commander/i
const ENGLISH_GRAMMAR_RE =
  /\bverb\b|\bnoun\b|plural|preposition|spelling|synonym|antonym|\bvoice\b|narration|phrase|idiom|adverb|adjective|conjunction|tense|article|pronoun|equivocation|correctly spelled|passive form|active form|positive degree|thesis statement|topic sentence/i
const ENGLISH_LIT_RE =
  /shakespeare|শেকসপিয়র|শেক্সপিয়র|poet|poem|novel|drama|dramatist|essay|playwright|Milton|মিল্টন|Coleridge|কোলরিজ|Yeats|ইয়েটস|Moby Dick|Keats|কিটস|Shelley|শেলি|Byron|বায়রন|Wordsworth|ওয়ার্ডসওয়ার্থ|author|written by|\bwrote\b|quoted from|extract is/i

function banglaRatio(s: string): number {
  const letters = [...s].filter((c) => /[\u0980-\u09FFA-Za-z]/.test(c))
  if (letters.length === 0) return 0
  return letters.filter((c) => /[\u0980-\u09FF]/.test(c)).length / letters.length
}

/**
 * Classify one MCQ into a canonical BCS subject nameBn.
 * Order is load-bearing (first match wins); see the notes above the
 * regexes. Pure — unit-testable without a database.
 */
export function classifyBcsSubject(question: string, explanation: string): string {
  const text = `${question} ${explanation}`
  const englishStem = banglaRatio(question) < 0.35
  if (has(ICT_RE, text) || ICT_ACRONYM_RE.test(text)) return "কম্পিউটার ও তথ্য প্রযুক্তি"
  if (has(MATH_RE, text)) return "গাণিতিক যুক্তি"
  if (has(MENTAL_RE, text)) return "মানসিক দক্ষতা"
  if (has(ENGLISH_GRAMMAR_RE, text)) return "English Language and Literature"
  // An English stem is never a Bangla-section question; Bangla explanations
  // must not drag English stems (e.g. Shakespeare quotes glossed in Bangla)
  // into বাংলা ভাষা ও সাহিত্য.
  if (!englishStem && has(BANGLA_RE, text)) return "বাংলা ভাষা ও সাহিত্য"
  if (has(ETHICS_RE, text)) return "নৈতিকতা, মূল্যবোধ ও সু-শাসন"
  if (has(GEO_RE, text)) return "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা"
  if (has(SCIENCE_RE, text) || SCIENCE_ACRONYM_RE.test(text)) return "সাধারণ বিজ্ঞান"
  if (has(ENGLISH_LIT_RE, text)) return "English Language and Literature"
  if (has(INTL_RE, text) || INTL_ACRONYM_RE.test(text)) return "আন্তর্জাতিক বিষয়াবলী"
  if (has(BD_RE, text)) return "বাংলাদেশ বিষয়াবলি"
  if (englishStem) return "English Language and Literature"
  return "বাংলাদেশ বিষয়াবলি"
}

/** Parse one .docx paper into RawBcsRecords. */
export function parseDocxFile(
  docxPath: string,
  examNum: number
): {
  records: RawBcsRecord[]
  unparsed: number
  total: number
} {
  const examTerm = `${enDigitsToBn(examNum)}তম বিসিএস`
  const paras = extractDocxParagraphs(docxPath)
  const groups = splitDocxRecords(paras)
  const records: RawBcsRecord[] = []
  let unparsed = 0
  for (const g of groups) {
    const p = parseDocxRecord(g)
    if (!p) {
      unparsed++
      continue
    }
    records.push({
      examTerm,
      examNum,
      year: null,
      subject: classifyBcsSubject(p.question, p.explanation),
      qnum: p.qnum ?? undefined,
      question: p.question,
      options: p.options,
      correctAnswer: p.correctAnswer,
      explanation: p.explanation,
    })
  }
  return { records, unparsed, total: groups.length }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const all: RawBcsRecord[] = []
  for (const { file, examNum } of DOCX_TERMS) {
    const full = join(BCS_DIR, file)
    if (!existsSync(full)) {
      console.warn(`⚠ Missing file (skipped): ${file}`)
      continue
    }
    const { records, unparsed, total } = parseDocxFile(full, examNum)
    console.log(
      `${examNum}th BCS (${file}): ${total} groups → ${records.length} parsed, ${unparsed} unparsed`
    )
    const preview = records.slice(0, 2)
    for (const r of preview) {
      console.log(`   e.g. [${r.subject}] ${(r.question ?? "").slice(0, 70)}…`)
    }
    all.push(...records)
  }
  // Subject distribution for review before import.
  const dist = new Map<string, number>()
  for (const r of all) dist.set(r.subject ?? "?", (dist.get(r.subject ?? "?") ?? 0) + 1)
  console.log("\nSubject distribution:")
  for (const [s, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${n}`)
  }
  if (dryRun) {
    console.log(`\n(DRY RUN — ${all.length} records, nothing written)`)
    return
  }
  writeFileSync(OUT_FILE, JSON.stringify(all, null, 1), "utf-8")
  console.log(`\nWrote ${all.length} records → ${OUT_FILE}`)
  console.log("Next: npx tsx scripts/import-bcs-exams.ts --dry-run  (validate), then apply.")
}

if (process.argv[1]?.endsWith("parse-bcs-docx.ts")) {
  main().catch((e) => {
    console.error("DOCX parse failed:", e)
    process.exit(1)
  })
}
