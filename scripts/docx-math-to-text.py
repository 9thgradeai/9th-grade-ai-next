#!/usr/bin/env python3
"""Convert a .docx with OMML equations to plain-text MCQs (stdlib only).

Linearizes Office Math into readable inline notation so the existing
seed pipeline (parseAlgebraBlocks + import gate) consumes the output
unchanged:
  fraction  -> (num)/(den)      superscript -> base^(sup)
  subscript -> base_(sub)        square root -> sqrt(e) / √(e)
  delimiters keep their brackets; boxes unwrap.

Usage:
  python3 scripts/docx-math-to-text.py <input.docx> <output.txt>
"""

import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"


def text_of(node) -> str:
    """Plain w:t text under a node (runs, instrText excluded)."""
    return "".join(
        t.text or "" for t in node.iter() if t.tag in (W + "t", M + "t")
    )


def omath(node) -> str:
    """Linearize one OMML element."""
    tag = node.tag
    if tag == M + "t":
        return node.text or ""
    if tag in (M + "r", M + "e", M + "num", M + "den", M + "sub",
               M + "sup", M + "deg", M + "box", M + "name"):
        return "".join(omath(c) for c in node if isinstance(c.tag, str))
    if tag == M + "f":  # fraction
        num = den = ""
        for c in node:
            if c.tag == M + "num":
                num = "".join(omath(x) for x in c)
            elif c.tag == M + "den":
                den = "".join(omath(x) for x in c)
        return f"({num})/({den})"
    if tag == M + "sSup":  # superscript
        base = sup = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sup":
                sup = "".join(omath(x) for x in c)
        return f"{base}^({sup})" if len(sup) > 1 else f"{base}^{sup}"
    if tag == M + "sSub":  # subscript
        base = sub = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sub":
                sub = "".join(omath(x) for x in c)
        return f"{base}_({sub})" if len(sub) > 1 else f"{base}_{sub}"
    if tag == M + "rad":  # radical
        deg = body = ""
        for c in node:
            if c.tag == M + "deg":
                deg = "".join(omath(x) for x in c)
            elif c.tag == M + "e":
                body = "".join(omath(x) for x in c)
        if deg:
            return f"({body})^(1/({deg}))"
        return f"√({body})"
    if tag == M + "d":  # delimiters
        beg, end, body = "", "", ""
        for c in node:
            if c.tag == M + "dPr":
                for p in c:
                    if p.tag == M + "begChr" and p.get(M + "val", "(") != "":
                        beg = p.get(M + "val", "(")
                    if p.tag == M + "endChr":
                        end = p.get(M + "val", ")")
            elif c.tag == M + "e":
                body += "".join(omath(x) for x in c)
        return f"{beg}{body}{end}"
    if tag == M + "oMathPara" or tag == M + "oMath":
        return "".join(omath(c) for c in node if isinstance(c.tag, str))
    # properties / control nodes carry no content
    return ""


def para_text(p) -> str:
    parts = []
    for c in p:
        if c.tag == W + "r":
            parts.append(text_of(c))
        elif c.tag in (M + "oMath", M + "oMathPara"):
            parts.append(omath(c))
        elif c.tag == W + "hyperlink":
            parts.append("".join(
                text_of(r) for r in c.iter(W + "r")))
    return "".join(parts)


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(src) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    body = root.find(W + "body")
    out = []
    for p in body.findall(W + "p"):
        out.append(para_text(p).strip())
    # collapse 3+ blank lines to a double break, keep block shape
    text = "\n".join(out)
    while "\n\n\n\n" in text:
        text = text.replace("\n\n\n\n", "\n\n\n")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    print(f"wrote {dst} ({len(out)} paragraphs)")


if __name__ == "__main__":
    main()
