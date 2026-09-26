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

# Book-style Unicode math: superscript/subscript runs render like print
# (2⁽ˣ⁺¹⁾, log₃81, ⁴√(81x⁸)). Superscript parens keep grouping unambiguous
# in linear text. Anything unmappable falls back to ^(...)/_(...) notation.
SUP = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵",
    "6": "⁶", "7": "⁷", "8": "⁸",     "9": "⁹", "+": "⁺", "-": "⁻",
    "−": "⁻", "/": "⁄", "(": "⁽", ")": "⁾", "n": "ⁿ", "x": "ˣ", "m": "ᵐ",
    "i": "ⁱ", "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ",
    "h": "ʰ", "k": "ᵏ", "l": "ˡ", "o": "ᵒ", "p": "ᵖ", "r": "ʳ",
    "s": "ˢ", "t": "ᵗ", "u": "ᵘ", "y": "ʸ", "z": "ᶻ", "g": "ᵍ",
    "f": "ᶠ", "j": "ʲ", "w": "ʷ", "v": "ᵛ", " ": "",
}
# Subscript glyphs may nest inside superscripts (3^(2log₃5) → 3²ˡᵒᵍ₃⁵);
# identity-map them so nesting survives instead of falling back to ^(...).
# (Superscript glyphs are deliberately NOT added: 2^(3²) must keep its
# explicit form rather than flattening to a misreadable 2³².)
SUP.update({
    "₀": "₀", "₁": "₁", "₂": "₂", "₃": "₃", "₄": "₄", "₅": "₅",
    "₆": "₆", "₇": "₇", "₈": "₈", "₉": "₉", "₊": "₊", "₋": "₋",
    "₍": "₍", "₎": "₎", "ₐ": "ₐ", "ₑ": "ₑ", "ₓ": "ₓ",
    "ₙ": "ₙ", "ₒ": "ₒ", "ᵢ": "ᵢ", "ᵣ": "ᵣ", "ᵤ": "ᵤ", "ₖ": "ₖ",
    "ₗ": "ₗ", "ₘ": "ₘ", "ₚ": "ₚ", "ₛ": "ₛ", "ₜ": "ₜ", "ₕ": "ₕ",
    "ⱼ": "ⱼ",
})
SUB = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅",
    "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋",
    "−": "₋", "(": "₍", ")": "₎", "a": "ₐ", "e": "ₑ", "x": "ₓ",
    "n": "ₙ", "o": "ₒ", "i": "ᵢ", "r": "ᵣ", "u": "ᵤ", "k": "ₖ",
    "l": "ₗ", "m": "ₘ", "p": "ₚ", "s": "ₛ", "t": "ₜ", "h": "ₕ",
    "j": "ⱼ",
}


def sup_run(s: str) -> str:
    """Superscript run, or ^(...) fallback when any char is unmappable."""
    if s and all(c in SUP for c in s):
        return "".join(SUP[c] for c in s)
    return f"^({s})"


def sub_run(s: str) -> str:
    """Subscript run, or _(....) fallback when any char is unmappable."""
    if s and all(c in SUB for c in s):
        return "".join(SUB[c] for c in s)
    return f"_({s})"


def simple_frac_part(s: str) -> bool:
    """True when a fraction side needs no grouping parens in linear text."""
    return bool(s) and " " not in s and not any(
        c in s for c in "+−-=<>")


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
        if simple_frac_part(num) and simple_frac_part(den):
            return f"{num}/{den}"
        return f"({num})/({den})"
    if tag == M + "sSup":  # superscript → book-style run
        base = sup = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sup":
                sup = "".join(omath(x) for x in c)
        return f"{base}{sup_run(sup)}"
    if tag == M + "sSub":  # subscript → book-style run
        base = sub = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sub":
                sub = "".join(omath(x) for x in c)
        return f"{base}{sub_run(sub)}"
    if tag == M + "rad":  # radical
        deg = body = ""
        hide_deg = False
        for c in node:
            if c.tag == M + "radPr":
                hide_deg = any(p.tag == M + "degHide" for p in c)
            if c.tag == M + "deg":
                deg = "".join(omath(x) for x in c)
            elif c.tag == M + "e":
                body = "".join(omath(x) for x in c)
        if deg and not hide_deg:
            # 4th root prints as ⁴√(…) exactly like the book.
            return f"{sup_run(deg)}√({body})"
        if deg and hide_deg:
            return f"√({body})"
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
