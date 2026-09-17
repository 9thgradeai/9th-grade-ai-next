#!/usr/bin/env python3
"""
Extract BCS-wise preliminary questions, answers and explanations from
bcs-exam-wise-demo.pdf into a human-reviewable .txt file.

NOTE ON TEXT QUALITY
--------------------
The PDF embeds Bengali with a broken ToUnicode mapping, so the extracted text
shows glyph corruption AND loses spaces between many Bengali words (e.g.
"বাংলাদেশ" -> "িবাংলােদেশর"). We deliberately reproduce the source text VERBATIM
(no auto-correction) so reviewers can correct wording. We split only around the
STRUCTURAL delimiters that survive intact:
  * BCS term headers   ("৫০তম বিসিএস")
  * Subject headers    (Bengali "...(প্রশ্ন ...)" / English "(Questions ...)")
  * Question numbers   (Bengali or Latin)
  * "উত্তর:" (answer) and "ব্যাখ্যা:" (explanation)
The raw text of each question, its options, and its explanation are preserved
exactly as extracted.
"""

import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "database" / "data" / "question_bank" / "bcs" / "bcs-exam-wise-demo.pdf"
OUT_PATH = ROOT / "database" / "data" / "question_bank" / "bcs" / "bcs-preliminary-extracted.txt"
DEBUG_PATH = ROOT / "database" / "data" / "question_bank" / "bcs" / "__bcs_pdf_debug.txt"

BN_DIGITS = "০১২৩৪৫৬৭৮৯"
def bng_to_en(s):
    return "".join(str(BN_DIGITS.index(c)) if c in BN_DIGITS else c for c in s)

HEADER_PATTERN = re.compile(r"^(.+?)\s*\(\s*[০-৯0-9][0-9,০-৯\s-]*\)\s*$")
QUESTION_NUM = re.compile(r"^\s*([০-৯]+)\.")

def is_term_header(line):
    m = re.match(r"^([০-৯]{1,2})তমিবিসএস$", line)
    return int(bng_to_en(m.group(1))) if m else None

# The Bengali "প্রশ্ন" gets OCR/corrupted to the marker "Ȟɖ" (U+021E, U+0256).
BN_Q_FILLER = re.compile(r"[\u021E\u0256প্রশ্ন]+", re.IGNORECASE)

def is_subject_header(line):
    stripped = line.strip()
    # Subject headers are short-ish and never option/answer/question lines.
    if len(stripped) > 140:
        return False
    if re.match(r"^\s*\([কখগঘ]", stripped) or stripped.startswith(("উত্তর", "বয্াখয্া", "ব্যাখ্যা")):
        return False
    if QUESTION_NUM.match(stripped):
        return False
    # Bengali subject header: "...(Ȟɖ <range...>)" OR "...(প্রশ্ন <range...>)"
    if re.search(r"\([^)]*(?:[\u021E\u0256]|প্রশ্ন)[^)]*\d", stripped):
        return True
    # English subject header: "...(Questions <n-m>)" or "...(Question <n-m>)"
    if re.search(r"\(\s*(?:Questions?)\b[^)]*\d", stripped, re.IGNORECASE):
        return True
    return False

def classify_question_head(ln):
    """Return the question number for a question-head line, else None."""
    m = QUESTION_NUM.match(ln)
    if not m:
        return None
    num = int(bng_to_en(m.group(1)))
    if 1 <= num <= 500:
        return num
    return None

def main():
    doc = pymupdf.open(str(PDF_PATH))
    raw_pages = [doc[i].get_text() for i in range(doc.page_count)]

    # Pages 0-4 are cover + publisher + table of contents (whose rows look
    # exactly like term headers "৫০তম বিসিএস" + a page number). Skip them so the
    # TOC is not mistaken for question content. Real question content starts on
    # page index 5.
    START_PAGE = 5

    lines = []
    for pi in range(START_PAGE, len(raw_pages)):
        for ln in raw_pages[pi].split("\n"):
            if ln.strip():
                lines.append((pi, ln.rstrip()))
    DEBUG_PATH.write_text(
        "\n".join(f"p{p:02d} | {ln}" for p, ln in lines), encoding="utf-8"
    )

    out = []
    answers_seen = 0
    questions_count = 0

    cur_term = None
    cur_subject = None
    pending_explanation = False

    for _, ln in lines:
        term = is_term_header(ln)
        if term is not None:
            if term == cur_term:
                # The term name is a running page header repeated on every page;
                # keep only the first occurrence as the section boundary.
                continue
            cur_term = term
            cur_subject = None
            pending_explanation = False
            out.append("\n\n" + "=" * 80)
            out.append(f"BCS TERM {term:02d}  |  {term}তম বিসিএস")
            out.append("=" * 80)
            continue

        if is_subject_header(ln):
            stripped = ln.strip()
            # Subject name = everything before the "(মার্কার ...)" range part.
            head = re.split(r"\(\s*(?:[\u021E\u0256]|প্রশ্ন)|\(\s*(?:Questions?)\b", stripped, maxsplit=1,
                            flags=re.IGNORECASE)[0].strip()
            cur_subject = head or stripped
            pending_explanation = False
            out.append("\n" + "-" * 72)
            out.append(f"SUBJECT: {cur_subject}")
            out.append("-" * 72)
            continue

        qn = classify_question_head(ln)
        if qn is not None:
            cur_subject_ctx = f" | subject: {cur_subject}" if cur_subject else ""
            out.append("\n" + "#" * 64)
            out.append(f"QUESTION {qn}{cur_subject_ctx}")
            out.append("#" * 64)
            out.append(f"  {ln.strip()}")
            questions_count += 1
            pending_explanation = False
            continue

        if ln.startswith("উত্তর:"):
            out.append(f"  উত্তর: {ln[len('উত্তর:'):].strip()}")
            answers_seen += 1
            pending_explanation = False
            continue

        if ln.startswith("বয্াখয্া") or ln.startswith("ব্যাখ্যা"):
            body = ln
            for pref in ("বয্াখয্া:", "বয্াখয্া", "ব্যাখ্যা:", "ব্যাখ্যা"):
                body = body.removeprefix(pref)
            body = body.lstrip(": ")
            out.append(f"  ব্যাখ্যা: {body}")
            pending_explanation = True
            continue

        # Ordinary line.
        if pending_explanation:
            out.append(f"      {ln}")
        else:
            out.append(f"  {ln}")

    text = "\n".join(out)
    OUT_PATH.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  lines processed = {len(lines)}")
    print(f"  questions detected = {questions_count}")
    print(f"  answers (উত্তর:) = {answers_seen}")
    print(f"  size = {len(text)} chars")

if __name__ == "__main__":
    main()
