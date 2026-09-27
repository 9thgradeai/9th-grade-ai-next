#!/usr/bin/env python3
"""Convert Bank English .docx files to reviewable .md with styling intact.

Reads the OOXML directly (stdlib only — no extra dependencies):
  bold runs    -> **text**
  italic runs  -> *text*   (in these docs italic = the underlined exam segment)
  bold+italic  -> ***text***

Drops question numbers ("1.", "2.", ...) — the app renders its own counters.
Two source layouts are handled:
  Layout 1 (single paragraph per MCQ): Synonym-Antonym, ErrorsDetection
      {stem} A) .. B) .. C) .. D) .. Ans: X | Speed Solution: {expl}
  Layout 2 (multi paragraph per MCQ): Clauses & Phrases, Idioms&Phrases,
      Voice & Narration — numbered stem para, one para per option,
      "Answer:" para, "Speed Shortcut:" explanation para.

Output: database/data/Bank/English/md/<Topic>.md — one block per MCQ:
  Q: <stem>
  A) <opt> / B) <opt> / C) <opt> / D) <opt>
  Ans: <A|B|C|D>
  Exp: <explanation>

Usage:
  python3 scripts/docx-bank-english-to-md.py        (convert all 5 files)
  python3 scripts/docx-bank-english-to-md.py --check (report only, no write)
"""

import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SRC = Path("database/data/Bank/English")
OUT = SRC / "md"

FILES = [
    ("Questions(Clauses & Phrases).docx", "Clauses & Phrases", "multi"),
    ("Questions(ErrorsDetections).docx", "Errors Detection", "single"),
    ("Questions(Idioms&Phrases).docx", "Idioms & Phrases", "multi"),
    ("Questions(Synonym-Antonym).docx", "Synonym-Antonym", "single"),
    ("Questions(Voice & Narration Transformation,).docx", "Voice & Narration", "multi"),
]

NUM_RE = re.compile(r"^\d+\.\s*")
OPT_SPLIT_RE = re.compile(r"\s([A-E])\)\s")
ANS_RE = re.compile(r"\bAns:\s*([A-E]|No Error)\b")
EXP_RE = re.compile(r"\|\s*Speed Solution:\s*")


def para_runs(p):
    """Return [(text, bold, italic)] for a paragraph, skipping empty runs."""
    out = []
    for r in p.findall(W + "r"):
        t = "".join(n.text or "" for n in r.findall(W + "t"))
        if not t:
            continue
        rp = r.find(W + "rPr")
        b = rp is not None and rp.find(W + "b") is not None
        i = rp is not None and rp.find(W + "i") is not None
        out.append((t, b, i))
    return out


def runs_to_md(runs):
    parts = []
    for text, b, i in runs:
        if b and i:
            parts.append(f"***{text}***")
        elif b:
            parts.append(f"**{text}**")
        elif i:
            parts.append(f"*{text}*")
        else:
            parts.append(text)
    return re.sub(r"[ \t\u00a0]+", " ", "".join(parts)).strip()


def parse_single(text_runs_md, failures, topic):
    """Parse one single-paragraph MCQ. Returns dict or None."""
    # Re-split on the PLAIN text for structure, then re-derive styled spans
    # by locating each field's plain text inside the styled string.
    plain = re.sub(r"[ \t\u00a0]+", " ", "".join(t for t, _, _ in text_runs_md)).strip()
    opt_marks = list(OPT_SPLIT_RE.finditer(plain))
    ans_m = ANS_RE.search(plain)
    if len(opt_marks) < 4 or not ans_m:
        failures.append(f"[{topic}] single-para structure miss: {plain[:100]}")
        return None
    # first A) B) C) D) in order (a duplicated 4th letter, e.g. A B C C,
    # is a source typo for D — repaired and logged below)
    seq = [m for m in opt_marks if m.group(1) in "ABCDE"]
    letters = [m.group(1) for m in seq]
    fixed = False
    if letters[:4] == ["A", "B", "C", "C"]:
        fixed = True
    if letters[:4] not in (["A", "B", "C", "D"], ["A", "B", "C", "C"]):
        failures.append(f"[{topic}] option order miss: {plain[:100]}")
        return None
    # option spans: from each marker to the next marker / Ans:
    bounds = [m.end() for m in seq[:4]] + [ans_m.start()]
    starts = [m.start() for m in seq[:4]]
    # stem = text before first A)
    stem_plain = plain[: starts[0]].strip()
    opts_plain = [plain[bounds[i]: starts[i + 1] if i < 3 else bounds[4]].strip() for i in range(4)]
    ans_raw = ans_m.group(1)
    if ans_raw == "No Error":
        # Error-detection "no error" sentence: "No Error" becomes option E.
        opts_plain.append("No Error")
        ans_raw = "E"
    if fixed:
        failures.append(f"[{topic}] FIXED duplicated C) -> D): {stem_plain[:80]}")
    exp_plain = EXP_RE.split(plain[ans_m.end():], maxsplit=1)
    exp_plain = exp_plain[1].strip() if len(exp_plain) == 2 else plain[ans_m.end():].strip()
    styled = runs_to_md(text_runs_md)

    def locate(field):
        """Find field text inside styled string (markers inflate length)."""
        if not field:
            return ""
        # strip markers from styled, find offset, then expand to marker bounds
        idx = strip_md(styled).find(field)
        if idx < 0:  # fallback: return plain field
            return field
        # walk styled string skipping * chars to map plain offsets
        mapping, p = [], 0
        for s_i, ch in enumerate(styled):
            if ch == "*":
                continue
            mapping.append(s_i)
            p += 1
        s0 = mapping[idx]
        s1 = mapping[idx + len(field) - 1] + 1 if field else s0
        # expand over adjacent asterisks
        while s0 > 0 and styled[s0 - 1] == "*":
            s0 -= 1
        while s1 < len(styled) and styled[s1] == "*":
            s1 += 1
        return styled[s0:s1]

    return {
        "q": locate(stem_plain),
        "opts": [locate(o) for o in opts_plain],
        "ans": ans_raw,
        "exp": locate(exp_plain),
    }


def strip_md(s):
    return s.replace("***", "").replace("**", "").replace("*", "")


def convert_file(filename, topic, layout):
    z = zipfile.ZipFile(SRC / filename)
    xml = ET.fromstring(z.read("word/document.xml"))
    paras = xml.findall(".//" + W + "p")
    records, failures = [], []
    if layout == "single":
        for p in paras:
            runs = para_runs(p)
            if not runs:
                continue
            rec = parse_single(runs, failures, topic)
            if rec:
                records.append(rec)
    else:
        cur = None
        started = False
        for p in paras:
            runs = para_runs(p)
            md = runs_to_md(runs)
            if not md:
                if cur and cur.get("opts") and len(cur["opts"]) == 4 and cur.get("ans"):
                    records.append(cur)
                cur = None
                continue
            if not started and not NUM_RE.match(md.replace("**", "")):
                continue
            started = True
            plain = strip_md(md)
            if NUM_RE.match(plain):
                if cur and cur.get("opts") and len(cur["opts"]) == 4 and cur.get("ans"):
                    records.append(cur)
                # strip the number AND its bold markers (**1.**) — the app
                # renders its own counters, numbers must not enter the stem.
                # Only markers directly attached to the number are consumed,
                # so a stem opening with *italic* keeps its opening marker.
                stem = re.sub(r"^(\*\*\*|\*\*|\*)?\d+\.(\*\*\*|\*\*|\*)?\s*", "", md, count=1).strip()
                cur = {"q": stem, "opts": [], "ans": "", "exp": ""}
            elif re.match(r"^[A-D]\)\s*", plain) and cur is not None:
                cur["opts"].append(re.sub(r"^[A-D]\)\s*", "", md, count=1))
            elif plain.startswith("Answer:") and cur is not None:
                m = re.search(r"Answer:\s*([A-D])", plain)
                if m:
                    cur["ans"] = m.group(1)
                else:
                    failures.append(f"[{topic}] bad Answer para: {plain[:80]}")
            elif plain.startswith("Speed Shortcut:") and cur is not None:
                cur["exp"] = re.sub(r"^Speed Shortcut:\s*", "", md, count=1).strip()
            elif cur is not None and not cur["opts"]:
                # stem continued on next para (defensive)
                cur["q"] += " " + md
            else:
                failures.append(f"[{topic}] stray para: {plain[:80]}")
        if cur and cur.get("opts") and len(cur["opts"]) == 4 and cur.get("ans"):
            records.append(cur)
    # validate
    for r in records:
        if len(r["opts"]) not in (4, 5) or r["ans"] not in "ABCDE" or not r["q"]:
            failures.append(f"[{topic}] invalid record: {strip_md(r['q'])[:80]}")
    return [r for r in records if len(r["opts"]) in (4, 5) and r["ans"] in "ABCDE" and r["q"]], failures


def write_md(topic, records):
    lines = [f"# Bank English · {topic}", ""]
    for r in records:
        lines.append(f"Q: {r['q']}")
        for letter, opt in zip("ABCDE", r["opts"]):
            lines.append(f"{letter}) {opt}")
        lines.append(f"Ans: {r['ans']}")
        lines.append(f"Exp: {r['exp'] if r['exp'] else '—'}")
        lines.append("")
    return "\n".join(lines)


def main():
    check_only = "--check" in sys.argv
    total_ok, total_fail = 0, []
    for filename, topic, layout in FILES:
        records, failures = convert_file(filename, topic, layout)
        print(f"{topic}: {len(records)} MCQs, {len(failures)} problems")
        for f in failures[:10]:
            print(f"   ! {f}")
        total_ok += len(records)
        total_fail += failures
        if not check_only:
            OUT.mkdir(parents=True, exist_ok=True)
            (OUT / f"{topic}.md").write_text(write_md(topic, records), encoding="utf-8")
    print(f"TOTAL: {total_ok} MCQs, {len(total_fail)} problems")
    if not check_only:
        print(f"Wrote {OUT}/<Topic>.md (question numbers stripped, styling kept)")


if __name__ == "__main__":
    main()
