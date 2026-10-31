# Question Import Format

How to hand over MCQs so they import cleanly on the first pass, including
questions that ship with figures, diagrams, or boxed/visual options.

This document describes the **input** formats. The rules in §5 are not
style preferences — they are the exact fatal conditions enforced by
`scripts/qb-forensics/import-gate.ts`, which every question must pass before
it can become a `Question` row.

---

## 0. TL;DR — what to send

| Your material | Send this | Importer |
|---|---|---|
| Text-only MCQs, Bengali | One `.txt` per topic in **Format A** | `scripts/import-bcs-mental.ts` |
| Text-only MCQs, English/Latin | One `.txt` in **Format B** | `scripts/import-mental-verbal-both.ts` |
| Any MCQ with a figure | Format A **plus** `<file>.figures/` + optional `<file>.figures.json` (§3) | `scripts/import-bcs-mental.ts` |
| MCQs where the options *are* figures | Format A with one composite labelled figure (§4) | `scripts/import-bcs-mental.ts` |

Minimum viable handover: **one `.txt` file** (Format A) and, if there are
figures, **a sibling `<file>.figures/` folder** named after that `.txt`.

---

## 1. Format A — Bengali text dump (canonical)

One logical record per line. Physical line wrapping is tolerated: lines that do
not start with a Bengali number are appended to the previous record.

```
০১. <stem> ক. <option1> খ. <option2> গ. <option3> ঘ. <option4> Ans. <letter>. <option text> ব্যাখ্যা: <explanation>
```

### Worked example

```
১২৩. যদি ৫ জন শ্রমিক ৬ দিনে একটি কাজ শেষ করে, তবে ১০ জন শ্রমিক কত দিনে করবে? ক. ৩ দিন খ. ৪ দিন গ. ৫ দিন ঘ. ৬ দিন Ans. ক. ৩ দিন ব্যাখ্যা: ৫×৬ = ১০×x ⇒ x = ৩ দিন।
```

### Hard rules (violating any one skips the record)

1. **Record starts with Bengali numerals + `. `** — `১২৩. ` at the start of a
   physical line. Latin digits (`123.`) do not start a record in this format.
2. **Exactly four options, in order, marked `ক.` `খ.` `গ.` `ঘ.`** — and each
   marker must be surrounded by whitespace: a space **before** the letter and a
   space **after** the period.
   - ✅ `ক. ৩ দিন`
   - ❌ `ক.৩ দিন` (no space after the period — not detected, record is dropped)
   - ❌ `ক)৩ দিন`, `(ক) ৩ দিন` (wrong marker punctuation)
3. **`Ans. <letter>. <option text>` — the text is mandatory.** A bare
   `Ans. ক.` does not parse.
4. **The answer text must equal the option at that letter, exactly** after
   trimming. A single trailing parenthetical may differ and is stripped
   automatically (`৪৫ বছর (পুনরাবৃত্তি সংশোধন: ৫০ বছর)`), but the values
   themselves must agree. Mismatches are skipped, never force-fitted.
5. **`ব্যাখ্যা:` must follow the answer and be non-empty.** Empty explanations
   are a fatal gate rejection — the question bank treats explanations as
   mandatory.
6. **No duplicate option values** within a record (`ক. ৪৫` and `খ. ৪৫`).
7. **UTF-8, NFC, no mojibake.** No replacement characters (`�`), no
   double-encoded UTF-8, no zero-width/control characters.
8. **No editorial notes inside a record.** Strings like `মান সমন্বয়:`,
   `পুনরাবৃত্তি সংশোধন:`, `(নোট)` embedded mid-question are treated as content
   and usually break the record or the option match. Fix the data before
   sending; do not annotate inline.
9. **Math must render.** Unicode math is preferred (`৫×৬`, `x²`, `⇒`). Do not
   emit raw LaTeX outside `$…$`; unbalanced `$` is a fatal rejection.

### Measured behaviour on the existing corpus

Running `parseMentalFile` over `database/data/ques/Mental Ablity/`:

| File | Parsed | Skipped |
|---|---|---|
| `Questions(বানান ও ভাষা …).txt` | 200 | 0 |
| `Questions(স্থানাঙ্ক সম্পর্ক …).txt` | 200 | 0 |
| `Questions[ভাষাগত যৌক্তিক বিচার …].txt` | 200 | 0 |
| `Questions[সংখ্যাগত ক্ষমতা …].txt` | 199 | 1 |
| `Questions[সমস্যা সমাধান …].txt` | 196 | 4 |

All 5 skips are source-data defects, not parser bugs: one missing space after
`ক.`, one truncated option list with an embedded repair note, and three
duplicate option values. Following rules 1–9 gives a 100% parse rate.

---

## 2. Format B — Latin text dump

Same shape, Latin markers. Used by `scripts/import-mental-verbal-both.ts`,
which imports to **both** the BCS and Bank `04_Analytical_Skills` trees.

```
1. <stem> A. <option1> B. <option2> C. <option3> D. <option4> Answer: B. <option text> Explanation: <explanation>
```

- Markers `A.` `B.` `C.` `D.` (optionally `E.`), each surrounded by whitespace.
- `Answer:` and `Explanation:` are the required labels.
- At least 4 options; the importer uses the first four.
- The answer letter must point at one of those four (an `E.` answer against a
  4-option record is skipped).

---

## 3. Figures — a folder and an optional sidecar

Figures are optional and live **beside the text file they belong to**. The
folder is the `.txt` name with `.figures/` appended, so question numbers never
collide between files:

```
database/data/ques/Mental Ablity/
├── Questions[সমস্যা সমাধান (Problem Solving)].txt
├── Questions[সমস্যা সমাধান (Problem Solving)].figures.json   ← optional
└── Questions[সমস্যা সমাধান (Problem Solving)].figures/
    ├── q014.png
    └── q052.png
```

That is the whole contract for the common case: **name the file `q<number>` and
drop it in the folder.** `q014.png` attaches to record `০১৪` in that `.txt`.
Bengali or Latin digits both work. Supported extensions: `.png`, `.jpg`,
`.jpeg`, `.webp`, `.svg`, `.gif`.

### The sidecar (alt text, overrides, hand-placed assets)

`<file>.figures.json` is keyed by question number. Keys may be `14`, `"014"`,
or `"০১৪"`. A value may be a bare URL string, one entry, or an array:

```json
{
  "14": [{ "kind": "image", "url": "/question-media/bcs-mental/problem-solving/q014.png", "alt": "চিত্র ১: ঘনকের সম্মুখ দৃশ্য" }],
  "52": [{ "file": "custom-52.webp", "alt": "ঘনকের জাল" }],
  "60": "/question-media/elsewhere/already-published.png"
}
```

- `url` — used verbatim. Use this for assets you manage yourself.
- `file` — a file inside the `.figures/` folder; it is copied into `public/`
  and given a URL automatically.
- A sidecar entry **replaces** auto-discovered files for that number, so it is
  how you attach alt text to `q014.png`.
- `alt` is read aloud by screen readers and shown if the image fails to load.
  Write it as a description of the figure, not "image".

### What happens on import

1. Local files are copied to `public/question-media/bcs-mental/<topic-slug>/`.
2. `Question.media` is written as `[{ "kind": "image", "url": "/…", "alt": "…" }]`.
3. The figure renders above the choice UI (`MediaAttachmentView`).
4. Records without figures are untouched — a rerun never clears media you set
   by hand on a text-only question.
5. Anything suspicious is logged, never fatal: duplicate `q14` files, sidecar
   files that do not exist, sidecar numbers with no matching question, and
   URLs not present under `public/`.

### Image guidance

- PNG or WebP, ≤ 1600 px on the long edge, ≤ 300 KB.
- Transparent background for line art; white is acceptable.
- Never store base64 in the database — URLs only.
- The renderer uses `aspect-[4/3]` with `object-cover`, so a 4:3 canvas avoids
  cropping. Wider or taller figures are cropped at the edges.

---

## 4. Questions whose *options* are figures

`Question.options` is a plain `string[]` — **per-option images are not
supported**, and the renderer only draws question-level media above the choices.

The working convention is a **single composite figure** containing all four
option figures, labelled ক/খ/গ/ঘ, with the option texts reduced to the labels:

```
৫৬. নিচের কোন চিত্রটি প্রশ্নবোধক স্থানে বসবে? ক. ক খ. খ গ. গ ঘ. ঘ Ans. গ. গ ব্যাখ্যা: …
```

with the composite image dropped in the `.figures/` folder as `q56.png`. The
answer resolves normally because the gate checks for an exact option match
first (`"গ"` matches `options[2]`), then falls back to letter resolution.

Do not split option figures into four separate images — only question-level
media is rendered, so three of the four would be ignored.

---

## 5. What the gate rejects

Fatal codes from `scanMca` (`scripts/qb-forensics/import-gate.ts`):

| Code | Meaning |
|---|---|
| `EMPTY_QUESTION` | Blank stem |
| `WRONG_OPTION_COUNT` | Fewer than 4 options |
| `EMPTY_OPTION` | One or more options blank |
| `DUPLICATE_OPTION` | Two options normalize to the same text |
| `EMPTY_ANSWER` | No `correctAnswer` |
| `ANSWER_MISMATCH` | Answer matches no option and is not a resolvable letter |
| `ANSWER_NOT_IN_OPTIONS` | Multi-answer form references a missing option |
| `EMPTY_EXPLANATION` | Explanation blank |
| `MULTI_TOO_FEW_ANSWERS` | `MULTIPLE_CHOICE` with < 2 answers |
| `STATEMENT_TOO_FEW` | `STATEMENT_COMBINATION` with < 2 statements |
| `BAD_QUESTION_TYPE` | Unknown `questionType` |
| `NON_NFC` | Text not Unicode NFC |
| `NON_STANDARD_SPACE` | Non-breaking / exotic spaces |
| `MATH_LITERAL_LATEX` | Raw LaTeX left outside math after normalization |
| `MATH_UNBALANCED_DOLLAR` | Odd number of `$` |
| `MATH_KATEX_ERROR` | Math still fails to render |
| *mojibake / replacement chars / control chars* | Encoding corruption in any field |
| *broken Bangla clusters* | Visual-order corruption or mangled `ব্যাখ্যা` header |
| *scaffold leak* | Option markers (`ক.` `খ.` …) inside option text |

Non-fatal issues are normalized automatically and do not block import.

---

## 6. File naming and topic routing

For Format A, the filename decides the topic under `09_মানসিক_দক্ষতা`:

| Filename contains | Topic path |
|---|---|
| `verbal` (case-insensitive) | `০১_ভাষাগত_যৌক্তিক_বিচার_Verbal_Reasoning` |
| `numerical` | `০৬_সংখ্যাগত_ক্ষমতা_Numerical_Ability` |
| anything else | `০২_সমস্যা_সমাধান_Problem_Solving` |

Name a new file `Questions[ভাষাগত যৌক্তিক বিচার (Verbal Reasoning)] (2).txt` to
land in verbal reasoning; `… (Numerical Ability)…` for numerical. Anything else
(including spatial/figure reasoning today) falls into problem solving. Adding a
dedicated topic means extending `T` and `routeTopic` in the importer.

Identity is `md5(subjectId|stem|option1|option2|option3|option4)` via
`sourceKey`, so re-running an import is idempotent: unchanged records update in
place, changed options create a new row.

---

## 7. Running an import

```bash
# validate only, no writes
npx tsx scripts/ingest-questions.ts --dry-run

# import Mental Ability text files (idempotent)
npx tsx scripts/import-bcs-mental.ts
```

Always run `--dry-run` first; it prints per-record gate verdicts and issue
codes so you can fix the source before touching the database.

---

## 8. Scope — which importers support figures today

Figure attachments are implemented in `scripts/media-attachments.ts` and wired
into **`scripts/import-bcs-mental.ts`** only. That is the Mental Ability /
Analytical Skills text pipeline.

Other importers (`import-bank-ict.ts`, `import-bank-exams.ts`,
`seed-questions.ts`, `ingest-questions.ts`) do not read `.figures/` folders. To
add one, call `resolveFigureMedia()` with the file's directory, stem, and a
public slug, then set `data.media` when the record number has entries — the
same three lines the mental importer uses.

`scripts/ingest-questions.ts --dry-run` remains the fastest way to validate the
text half of a batch before importing, but it does not validate figures.
