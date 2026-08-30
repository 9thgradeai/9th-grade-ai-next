# Question-Bank Forensics (`scripts/qb-forensics/`)

A read-first, write-last maintenance toolchain that audits the 9Th-Grade question
bank for **representation/layout corruption** (Unicode normalization, visual-order
Bangla mojibake, option/answer alignment) and repairs only what is **provably safe**
to fix automatically, while routing every ambiguous/mangled record to a **human
review queue**.

It operates on **both** the live PostgreSQL DB **and** the seed source files under
`database/data/ques/` so that fixes survive every redeploy (the DB is re-seeded from
those files).

## Philosophy

- **AUTO (HIGH confidence)** — deterministic, meaning-preserving, invariant-under-re-seed:
  - BOM strip, non-standard-whitespace → `0x20`, collapse multi-space + trim
  - Unicode NFC (composes decomposed `ে + া → ো`, `য়`, `়`, etc.)
  - literal HTML-entity / `\n` escape decoding
  - provable answer↔option alignment (letter-answer resolution where the resolved
    option text matches; canonicalization to the identical NFC option)
- **REVIEW (MEDIUM/LOW)** — the visual-order / mis-parse corruption (pre-base vowel
  signs floated before consonants, space-split conjuncts, loosened `র্`, malformed
  `ব্যাখ্যা` headers, empty/duplicate/short options, answer-not-in-options, control
  chars, ZWJ is *preserved and NOT flagged*).
  These are never auto-rewritten. A candidate reconstruction is emitted for a human
  to verify against `bcs_p6_out.txt` (the clean extract) before applying.
- A whole record goes to REVIEW the moment ANY content field is mangled — we never
  guess, never rewrite meaning.

## Quick start

```bash
# 1. Read-only DB audit -> scripts/qb-forensics/artifacts/{audit-report,review-required,repair-plan}.json + .md
DATABASE_URL=... npx tsx scripts/qb-forensics/index.ts audit

# 2. Read-only source scan -> source-plan.json
npx tsx scripts/qb-forensics/index.ts source

# 3. Dry-run (no writes) for DB + source
DATABASE_URL=... npx tsx scripts/qb-forensics/index.ts dry-run

# 4. Backup the DB (recommended before any apply)
DATABASE_URL=... npx tsx scripts/qb-forensics/index.ts backup

# 5. Apply deterministic fixes to the DB (transactional, guarded) 
DATABASE_URL=... npx tsx scripts/qb-forensics/index.ts apply --yes

# 6. Write fixed source files (byte-lossless; untouched/REVIEW lines stay identical)
npx tsx scripts/qb-forensics/index.ts apply-source --yes

# 7. Post-migration rescan
DATABASE_URL=... npx tsx scripts/qb-forensics/index.ts verify
```

## CLI

| command       | description                                              | writes? |
|---------------|----------------------------------------------------------|---------|
| `audit`       | read-only DB scan + artifacts                            | no      |
| `source`      | read-only source scan + `source-plan.json`               | no      |
| `dry-run`     | DB + source dry-run, writes artifacts only               | no      |
| `backup [p]`  | `pg_dump` custom-format to `artifacts/backup.dump`       | file    |
| `apply`       | transactional DB apply (guarded by invariants)           | DB      |
| `apply-source`| write fixed source lines (byte-lossless)                 | files   |
| `verify`      | post-apply rescan                                        | no      |

Flags: `--yes` (confirm writes), `--no-source` (skip source during `apply`).

## Safety controls

- `apply` runs each record's updates inside a single Prisma transaction; if the
  post-write invariant check (correctAnswer still within the options set, no AUTO
  record becomes mangled) fails, nothing is written.
- `apply-source` only substitutes the exact repaired line for a deterministic fix;
  every other byte (line endings, indentation, blank lines, REVIEW lines) is
  preserved verbatim, including mixed CRLF/LF and trailing-newline differences.
- Both DB and source are repaired with the **same** deterministic transformation,
  so a reseed reproduces the fixed content (durability) — see the parity tests.

## Files

- `unicode.ts` – deterministic Unicode/whitespace/escape normalization
- `bangla.ts` – Bangla visual-order detection + de-shape *candidate* generation
- `issues.ts` – shared types (Issue / Fix / Candidate / ClassifiedRecord)
- `classify.ts` – the classifier (AUTO vs REVIEW) + transform chain
- `parse-flat.ts` – dependency-free mirror of `scripts/seed-questions.ts` parser
- `source.ts` – source-file scan + byte-lossless repair
- `audit.ts` – read-only DB scanner + report aggregation
- `migrate.ts` – backup, dry-run, transactional apply, verify
- `report.ts` – JSON + Markdown artifacts
- `index.ts` – CLI

## Tests

```bash
npx vitest run tests/qb-forensics.test.ts tests/qb-forensics-src.test.ts
```

Covers normalization, corruption detection, parser parity with the seeder,
AUTO/REVIEW routing, and the durability guarantee (source fix == DB fix / reseed).
