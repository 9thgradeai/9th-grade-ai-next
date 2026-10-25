#!/usr/bin/env python3
"""Convert the two Analytical Skills .docx sources to one-MCQ-per-line .txt records.

Source : database/data/Bank/Analytical Skills/Questions(<topic>).docx
Output : database/data/Bank/Analytical Skills/txt/Questions(<topic>).txt

The .txt shape is what scripts/import-analytical-skills.ts parses, so that
script needs no docx awareness. stdlib only (zipfile + ElementTree), mirroring
scripts/docx-bangla-grammar-to-txt.py.

Layout (both files): one paragraph per field, with two wrinkles —

  * options may sit on ONE paragraph ("A. 50 B. 52 C. 54 D. 56",
    "A) 125 B) 126 C) 127 D) 129") or on FOUR paragraphs ("A. WLT" …);
  * the question (and the explanation) may run over several paragraphs.

Record assembly: a paragraph starting with a number opens a record; every
other paragraph continues it. Section headings are dropped, and a numbered
paragraph that carries no answer marker is a TITLE, not a question — the
sources number titles exactly like questions ("199. Number Series"), so
dropping answer-less records is what separates them.

Each record is re-emitted canonically on one line:

    NN. <question> A. <o1> B. <o2> C. <o3> D. <o4> Answer: <raw> Explanation: <text>

`Answer:` keeps the source's own wording (letter and words) — resolution and
validation happen in the TypeScript parser so the .txt stays auditable against
the .docx. A record without a source explanation simply ends after the answer,
which is exactly what the import gate's EMPTY_EXPLANATION waiver looks for.
"""
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MATH = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
SRC = Path("database/data/Bank/Analytical Skills")
OUT = SRC / "txt"

NUMBERED = re.compile(r"^\s*([\d০-৯]+)\s*[.)]\s*(.*)$")
ANSWER = re.compile(r"^(?:Correct\s+Answer|Answer|Ans)\s*:\s*(.*)$", re.IGNORECASE)
EXPLAIN = re.compile(r"^(?:Explanation|ব্যাখ্যা)\s*:\s*(.*)$", re.IGNORECASE)
HEADER = re.compile(r"^(?:Part|Section|Directions?|Instructions?|Note)\b", re.IGNORECASE)
OPTION_AT_START = re.compile(r"^\s*\(?([A-Da-d])\)?\s*[.)]\s*\S")
INLINE_OPTIONS = re.compile(
    r"(?:^|\s)\(?([A-Da-d])\)?\s*[.)]\s*(.+?)(?=(?:\s+\(?[A-Da-d]\)?\s*[.)])|$)"
)
BENGALI_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
SPACE = re.compile(r"\s+")


def squash(text: str) -> str:
    """Collapse runs of whitespace — one record must survive as one line."""
    return SPACE.sub(" ", text).strip()


def paragraphs(path: Path) -> list[str]:
    """All non-empty paragraphs of word/document.xml, runs + inline math
    concatenated in document order (equations live in m:t, not w:t)."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    out = []
    for p in root.iter(W + "p"):
        buf = []
        for node in p.iter():
            if node.tag in (W + "t", MATH + "t"):
                buf.append(node.text or "")
        text = squash("".join(buf))
        if text:
            out.append(text)
    return out


def split_inline_options(line: str) -> list[tuple[str, str]]:
    return [(letter.upper(), squash(value)) for letter, value in INLINE_OPTIONS.findall(line)]


def assemble(paras: list[str]) -> tuple[list[dict], list[str]]:
    """Group paragraphs into records. Returns (records, dropped non-records)."""
    records: list[dict] = []
    dropped: list[str] = []
    parts: list[str] = []

    for text in paras:
        if HEADER.match(text):
            if parts:
                _flush(parts, records, dropped)
                parts = []
            dropped.append(text)
            continue
        match = NUMBERED.match(text)
        if match:
            if parts:
                _flush(parts, records, dropped)
            parts = [text]
        elif not parts:
            dropped.append(text)  # preamble before the first question
        else:
            parts.append(text)
    if parts:
        _flush(parts, records, dropped)
    return records, dropped


def _flush(parts: list[str], records: list[dict], dropped: list[str]) -> None:
    number = NUMBERED.match(parts[0])
    assert number is not None
    raw_number = number.group(1).translate(BENGALI_DIGITS)
    number_value = int(raw_number) if raw_number.isdigit() else 0

    answer_index = next((i for i, p in enumerate(parts) if ANSWER.match(p)), None)
    if answer_index is None:
        # A numbered section title ("199. Number Series") — not a question.
        dropped.append(parts[0])
        return

    question_parts: list[str] = []
    first = NUMBERED.match(parts[0])
    assert first is not None
    leading = squash(first.group(2))
    if leading:
        question_parts.append(leading)
    options: list[tuple[str, str]] = []
    for text in parts[1:answer_index]:
        if OPTION_AT_START.match(text):
            options.extend(split_inline_options(text))
        else:
            question_parts.append(text)

    answer_match = ANSWER.match(parts[answer_index])
    assert answer_match is not None
    answer_tail = answer_match.group(1)

    # An answer and its explanation occasionally share one paragraph.
    explanation_index = next(
        (i for i in range(answer_index, len(parts)) if EXPLAIN.match(parts[i])),
        None,
    )
    embedded = EXPLAIN.search(answer_tail)
    if explanation_index is not None:
        first = EXPLAIN.match(parts[explanation_index])
        assert first is not None
        pieces = ([answer_tail[embedded.end():]] if embedded else []) + [first.group(1)]
        pieces.extend(parts[explanation_index + 1:])
        explanation = squash(" ".join(pieces))
    elif embedded:
        explanation = squash(answer_tail[embedded.end():])
    else:
        explanation = ""
    if embedded:
        answer_tail = answer_tail[: embedded.start()]
    answer = squash(answer_tail)

    question = squash(" ".join(question_parts))
    letters = [letter for letter, _ in options]
    values = [value for _, value in options]

    problems = []
    if not question:
        problems.append("empty question")
    if letters != ["A", "B", "C", "D"]:
        problems.append(f"option letters {letters} (expected A B C D)")
    if any(not value for value in values):
        problems.append("empty option")
    if not answer:
        problems.append("empty answer")
    if problems:
        raise SystemExit(f"record {number_value}: {'; '.join(problems)} — {parts[0][:90]}")

    line = f"{number_value}. {question} "
    line += " ".join(f"{letter}. {value}" for letter, value in options)
    line += f" Answer: {answer}"
    if explanation:
        line += f" Explanation: {explanation}"
    records.append({"number": number_value, "line": line, "label": parts[0][:70]})


def main() -> None:
    sources = sorted(SRC.glob("*.docx"))
    if not sources:
        raise SystemExit(f"no .docx sources under {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for path in sources:
        records, dropped = assemble(paragraphs(path))
        numbers = [r["number"] for r in records]
        if len(set(numbers)) != len(numbers):
            raise SystemExit(f"{path.name}: duplicate question numbers")
        target = OUT / (path.stem + ".txt")
        target.write_text("\n".join(r["line"] for r in records) + "\n", encoding="utf-8")
        total += len(records)
        print(f"{path.name}: {len(records)} records -> {target}")
        for line in dropped:
            print(f"    (heading, not a record) {line[:80]}")
    print(f"total: {total} records")


if __name__ == "__main__":
    main()
