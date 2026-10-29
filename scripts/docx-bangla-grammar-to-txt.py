#!/usr/bin/env python3
"""Convert seven Bangla Grammar .docx sources to one-MCQ-per-line .txt records.

Sources:
  database/data/Bank/Bangla/Grammar/Questions(<topic>).docx
  database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Questions(<topic>).docx
Output:
  database/data/Bank/Bangla/Grammar/txt/Questions(<topic>).txt

Every source writes into the one staging folder the importer reads, including
the three supplied under `ques/.../ভাষা`: they deliberately do NOT get a `txt/`
beside themselves because `scripts/seed-questions.ts` walks `database/data/ques`
recursively and would ingest the generated files a second time. Nothing walks
the Bank staging folder, so these files stay inert except to the importer.

The .txt shape is exactly what scripts/import-bangla-grammar.ts parses
(strict `parseLine`), so the importer needs no docx awareness. stdlib only
(zipfile + ElementTree), mirroring scripts/docx-grammar-to-md.py.

Layouts handled (every file uses one, or a mix of both):

  A) single paragraph per MCQ   — Terminology, বাচ্য, 299/300 of বাগধারা,
                                  বিপরীত শব্দ, বিরাম চিহ্ন
       NN. <question> ক. <o1> খ. <o2> গ. <o3> ঘ. <o4> Ans./উত্তর: <key> ব্যাখ্যা: <exp>
  B) one paragraph per field    — all 200 of পদ, the split বাগধারা row,
                                  ণ-ত্ব ও ষ-ত্ব বিধান
       NN. <question>
       ক. <o1> খ. <o2> গ. <o3> ঘ. <o4>
       উত্তর: <key>
       ব্যাখ্যা: <exp>

Assembly rule: a paragraph starting with a number opens a record; following
paragraphs carrying an option / answer / explanation marker continue it; any
other paragraph (title, "প্রথম পর্ব: …" section header) closes the record and
is dropped, so a header can never leak into the previous explanation.

The source text is otherwise preserved verbatim — only the field paragraphs
are joined with single spaces, and each record ends with a newline.
"""
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SRC = Path("database/data/Bank/Bangla/Grammar")
VASHA = Path("database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা")
OUT = SRC / "txt"
SOURCES = [
    (SRC, "Questions(Terminology).docx"),
    (SRC, "Questions(বাগধারা).docx"),
    (SRC, "Questions(পদ).docx"),
    (SRC, "Questions(বাচ্য).docx"),
    (VASHA, "Questions(ণ-ত্ব ও ষ-ত্ব বিধান).docx"),
    (VASHA, "Questions(বিপরীত শব্দ).docx"),
    (VASHA, "Questions(বিরাম চিহ্ন বা যতি চিহ্ন).docx"),
]

NUMBERED = re.compile(r"^\s*[০-৯0-9]+\s*[.)]")
OPTION = re.compile(r"[কখগঘঙ]\s*[.)]")
ANSWER = re.compile(r"উত্তর\s*:|Ans\.?\s*|Answer\s*:", re.IGNORECASE)
EXPLAIN = re.compile(r"ব্যাখ্যা\s*:|Explanation\s*:", re.IGNORECASE)


def paragraphs(path: Path) -> list[str]:
    """All non-empty paragraphs of word/document.xml, runs concatenated."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    out = []
    for p in root.iter(W + "p"):
        text = "".join(n.text or "" for n in p.iter(W + "t"))
        if text.strip():
            out.append(text)
    return out


def assemble(paras: list[str]) -> tuple[list[str], list[str]]:
    """Group paragraphs into records. Returns (records, dropped non-records)."""
    records: list[str] = []
    dropped: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            records.append(" ".join(part.strip() for part in current if part.strip()))

    for text in paras:
        if NUMBERED.match(text):
            flush()
            current = [text]
        elif ANSWER.search(text) or EXPLAIN.search(text) or (
            OPTION.search(text) and current
        ):
            # field paragraph: options / answer / explanation
            current.append(text)
        else:
            # title or section header — closes the record, kept out of it
            flush()
            current = []
            dropped.append(text.strip())
    flush()
    return records, dropped


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    seen: set[str] = set()
    for src, name in SOURCES:
        path = src / name
        if not path.is_file():
            raise SystemExit(f"missing source: {path}")
        if path.stem in seen:
            raise SystemExit(f"duplicate target name: {path.stem}.txt")
        seen.add(path.stem)
        records, dropped = assemble(paragraphs(path))
        target = OUT / (path.stem + ".txt")
        target.write_text("\n".join(records) + "\n", encoding="utf-8")
        total += len(records)
        print(f"{name}: {len(records)} records -> {target}")
        for line in dropped:
            print(f"    (header, not a record) {line[:80]}")
    print(f"total: {total} records")


if __name__ == "__main__":
    main()
