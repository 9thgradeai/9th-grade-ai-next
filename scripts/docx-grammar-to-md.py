#!/usr/bin/env python3
"""Convert English Grammar .docx (Verb, Adverb, Synonym, Antonym) to .md, styling intact.
stdlib only: bold -> **text**, italic OR underline -> *text*, bold+(italic|underline) -> ***text***.
Handles single-paragraph-per-MCQ layout with variants:
  Stem (a)/(A) opt ... Ans: X [Explanation:|Speed Solution:|exp after |]
Question numbers stripped; app renders its own counters.
"""
import re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SRC = Path("database/data/ques/English/Grammar")
OUT = SRC / "md"
FILES = [
    ("Questions(Verb&Causative Verb).docx", "Verb & Causative Verb"),
    ("Questions(Adverb).docx", "Adverb"),
    ("Questions(Synonym).docx", "Synonym"),
    ("Questions(Antonyms).docx", "Antonyms"),
]
OPT_RE = re.compile(r"([A-Da-d])\)\s*")
ANS_RE = re.compile(r"Ans:\s*([A-Da-d])")
EXP_SPLIT = re.compile(r"\s*(?:\|\s*)?(?:Explanation:|Speed Solution:)\s*")


def para_runs(p):
    out = []
    for r in p.findall(W + "r"):
        t = "".join(n.text or "" for n in r.findall(W + "t"))
        if not t:
            continue
        rp = r.find(W + "rPr")
        b = rp is not None and rp.find(W + "b") is not None
        em = rp is not None and (rp.find(W + "i") is not None or rp.find(W + "u") is not None)
        out.append((t, b, em))
    return out


def runs_to_md(runs):
    parts = []
    for text, b, em in runs:
        if b and em:
            parts.append(f"***{text}***")
        elif b:
            parts.append(f"**{text}**")
        elif em:
            parts.append(f"*{text}*")
        else:
            parts.append(text)
    return re.sub(r"[ \t\u00a0]+", " ", "".join(parts)).strip()


def strip_md(s):
    return s.replace("***", "").replace("**", "").replace("*", "")


def parse_para(runs, failures, topic):
    plain = re.sub(r"[ \t\u00a0]+", " ", "".join(t for t, _, _ in runs)).strip()
    plain = re.sub(r"^\d+\.\s*", "", plain)
    marks = list(OPT_RE.finditer(plain))
    ans_m = ANS_RE.search(plain)
    if len(marks) < 4 or not ans_m:
        failures.append(f"[{topic}] structure miss: {plain[:100]}")
        return None
    # take first A-D in order (case-insensitive); dedupe repeated letters (source typos)
    seen, seq = set(), []
    for m in marks:
        L = m.group(1).upper()
        if L in "ABCD" and L not in seen and m.start() < ans_m.start():
            seen.add(L)
            seq.append(m)
        if len(seq) == 4:
            break
    if len(seq) < 4:
        failures.append(f"[{topic}] option order miss: {plain[:100]}")
        return None
    bounds = [m.end() for m in seq] + [ans_m.start()]
    starts = [m.start() for m in seq]
    stem_plain = plain[: starts[0]].strip().rstrip("([ ").strip()
    opts_plain = [plain[bounds[i]: starts[i + 1] if i < 3 else bounds[4]].strip().rstrip("([ ").strip() for i in range(4)]
    ans_raw = ans_m.group(1).upper()
    tail = plain[ans_m.end():].strip()
    exp_plain = EXP_SPLIT.split(tail, maxsplit=1)
    exp_plain = exp_plain[1].strip() if len(exp_plain) == 2 else tail
    if exp_plain in ("—", "-", ""):
        exp_plain = ""
    styled = runs_to_md(runs)
    styled = re.sub(r"^(\*\*\*|\*\*|\*)?\d+\.(\*\*\*|\*\*|\*)?\s*", "", styled, count=1)

    def locate(field):
        if not field:
            return ""
        idx = strip_md(styled).find(field)
        if idx < 0:
            return field
        mapping = []
        for s_i, ch in enumerate(styled):
            if ch == "*":
                continue
            mapping.append(s_i)
        s0 = mapping[idx]
        s1 = mapping[idx + len(field) - 1] + 1 if field else s0
        while s0 > 0 and styled[s0 - 1] == "*":
            s0 -= 1
        while s1 < len(styled) and styled[s1] == "*":
            s1 += 1
        return styled[s0:s1]

    return {"q": locate(stem_plain), "opts": [locate(o) for o in opts_plain], "ans": ans_raw, "exp": locate(exp_plain)}


def convert_file(filename, topic):
    z = zipfile.ZipFile(SRC / filename)
    xml = ET.fromstring(z.read("word/document.xml"))
    records, failures = [], []
    for p in xml.findall(".//" + W + "p"):
        runs = para_runs(p)
        if not runs:
            continue
        md_probe = runs_to_md(runs)
        if not strip_md(md_probe).strip():
            continue
        # skip header/title paras without options
        if not OPT_RE.search(strip_md(md_probe)) or not ANS_RE.search(strip_md(md_probe)):
            # concatenations of two MCQs in one para (Verb file Q2) contain 8 options + 2 Ans —
            # split on the second Ans is out of scope; log and let parser take first MCQ
            failures.append(f"[{topic}] non-MCQ para skipped: {strip_md(md_probe)[:80]}")
            continue
        rec = parse_para(runs, failures, topic)
        if rec:
            records.append(rec)
    for r in records:
        if len(r["opts"]) != 4 or r["ans"] not in "ABCD" or not strip_md(r["q"]):
            failures.append(f"[{topic}] invalid record: {strip_md(r['q'])[:80]}")
    return [r for r in records if len(r["opts"]) == 4 and r["ans"] in "ABCD" and strip_md(r["q"])], failures


def write_md(topic, records):
    lines = [f"# English Grammar · {topic}", ""]
    for r in records:
        lines.append(f"Q: {r['q']}")
        for letter, opt in zip("ABCD", r["opts"]):
            lines.append(f"{letter}) {opt}")
        lines.append(f"Ans: {r['ans']}")
        lines.append(f"Exp: {r['exp'] if r['exp'] else '—'}")
        lines.append("")
    return "\n".join(lines)


def main():
    check_only = "--check" in sys.argv
    total = 0
    for filename, topic in FILES:
        records, failures = convert_file(filename, topic)
        print(f"{topic}: {len(records)} MCQs, {len(failures)} problems")
        for f in failures[:15]:
            print(f"   ! {f}")
        total += len(records)
        if not check_only:
            OUT.mkdir(parents=True, exist_ok=True)
            (OUT / f"{topic}.md").write_text(write_md(topic, records), encoding="utf-8")
    print(f"TOTAL: {total} MCQs")
    if not check_only:
        print(f"Wrote {OUT}/<Topic>.md (numbers stripped, styling kept)")


if __name__ == "__main__":
    main()
