#!/usr/bin/env python3
"""Convert a .docx with OMML equations to LaTeX-augmented MCQ text.

Same paragraph shape as docx-math-to-text.py, but Office Math linearizes to
inline LaTeX ($...$) instead of Unicode approximations so the KaTeX renderer
typesets book-exact fractions / roots / scripts:

  fraction   -> $\\frac{num}{den}$     superscript -> $base^{sup}$
  subscript  -> $base_{sub}$           square root -> $\\sqrt[e]{body}$
  log_b x    -> $\\log_{b}{x}$ (when the OMML nests sSub under "log")

Plain runs pass through untouched — only the math span itself is wrapped.

Usage:
  python3 scripts/docx-math-to-latex.py <input.docx> <output.txt>
"""

import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"


def latex_escape(s: str) -> str:
    return (
        s.replace("\\", "\\textbackslash ")
        .replace("&", "\\&")
        .replace("%", "\\%")
        .replace("#", "\\#")
        .replace("_", "\\_")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("×", "\\times ")
        .replace("·", "\\cdot ")
        .replace("−", "-")
        .replace("–", "-")
    )


# Plain-run text (outside OMML) must NOT gain LaTeX commands: a literal
# "\times" in prose would be mangled by downstream transforms, and the TS
# migration renders ×/· natively. Only & % # _ { } and dashes are escaped;
# Unicode super/subscript runs become $...$ spans (same shapes as
# scripts/qb-forensics/unicode-math-to-latex.ts) so mixed OMML/plain runs
# never freeze raw sups inside a $ span.
_SUP_MAP = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")",
    "ˣ": "x", "ⁿ": "n", "ᵐ": "m", "ⁱ": "i", "ᵃ": "a",
    "ᵇ": "b", "ᶜ": "c", "ᵈ": "d", "ᵉ": "e", "ᶠ": "f",
    "ᵍ": "g", "ʰ": "h", "ʲ": "j", "ᵏ": "k", "ˡ": "l",
    "ᵒ": "o", "ᵖ": "p", "ʳ": "r", "ˢ": "s", "ᵗ": "t",
    "ᵘ": "u", "ᵛ": "v", "ʷ": "w", "ʸ": "y", "ᶻ": "z",
    "⁄": "/", "／": "/", "ᐟ": "/",
}
# Subscript glyphs may nest inside superscript runs (2²⁺ˡᵒᵍ₂ → 2^{2+log2});
# identity-map them so nesting survives (mirrors unicode-math-to-latex.ts).
_SUP_MAP.update({
    "₀": "₀", "₁": "₁", "₂": "₂", "₃": "₃", "₄": "₄", "₅": "₅",
    "₆": "₆", "₇": "₇", "₈": "₈", "₉": "₉", "₊": "₊", "₋": "₋",
    "₍": "₍", "₎": "₎", "ₐ": "ₐ", "ₑ": "ₑ", "ₓ": "ₓ",
    "ₙ": "ₙ", "ₒ": "ₒ", "ᵢ": "ᵢ", "ᵣ": "ᵣ", "ᵤ": "ᵤ", "ₖ": "ₖ",
    "ₗ": "ₗ", "ₘ": "ₘ", "ₚ": "ₚ", "ₛ": "ₛ", "ₜ": "ₜ", "ₕ": "ₕ",
    "ⱼ": "ⱼ",
})
_SUB_MAP = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "₊": "+", "₋": "-", "₍": "(", "₎": ")",
    "ₐ": "a", "ₑ": "e", "ₓ": "x", "ₙ": "n", "ₒ": "o",
    "ᵢ": "i", "ᵣ": "r", "ᵤ": "u", "ₖ": "k", "ₗ": "l",
    "ₘ": "m", "ₚ": "p", "ₛ": "s", "ₜ": "t", "ₕ": "h",
    "ⱼ": "j",
}
_SUP_SET = set(_SUP_MAP) | set(_SUB_MAP)  # sub glyphs may nest in sup runs
_SUB_SET = set(_SUB_MAP)
_SUP_CLS = "".join(sorted(_SUP_SET))
_SUB_CLS = "".join(sorted(_SUB_SET))


def _cls(s: str) -> str:
    return re.escape(s)


def plain_run(s: str, wrap: bool = True) -> str:
    """Convert plain text to LaTeX-augmented text.

    wrap=True (default) for text outside OMML: math becomes $...$ spans.
    wrap=False for text already inside an OMML $...$ span: math becomes
    bare ^{...}/_{...} fragments (never nested $).
    """
    pre = "$" if wrap else ""
    post = "$" if wrap else ""
    s = (
        s.replace("&", "\\&")
        .replace("%", "\\%")
        .replace("#", "\\#")
        .replace("_", "\\_")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("−", "-")
        .replace("–", "-")
    )
    # log with Unicode subscript first (log₃81 → $\log_{3}{81}$).
    s = re.sub(
        r"log([" + _cls(_SUB_CLS) + r"]{1,4})([0-9a-zA-Z০-৯]+)",
        lambda m: f"{pre}\\log_{{{''.join(_SUB_MAP[c] for c in m.group(1))}}}{{{m.group(2)}}}{post}",
        s,
    )
    # Base + superscript run (balanced "(...)" binds as one base; a lone
    # ")" also binds so frozen splits like "(x …)ˣ" wrap for later fusion.
    # Nested runs inside the base are thawed first: (xᵃ/xᵇ)² → $(x^{a}/x^{b})^{2}$.
    # Footnote guard mirrors scripts/qb-forensics/unicode-math-to-latex.ts:
    # lone-letter runs convert only on a numeric/paren base (2ᵃ, not reportᵃ).
    def sup_repl(m):
        base, run = m.group(1), m.group(2)
        if all(c in _SUB_SET for c in run):
            return m.group(0)
        ascii = "".join(_SUP_MAP.get(c, c) for c in run)
        lone_ok = ascii in ("x", "n") or (
            len(ascii) == 1 and ascii.isalpha() and base and base[-1] in "0123456789)]।"
        )
        if not (any(c.isdigit() or c in "+-()" for c in ascii) or lone_ok):
            return m.group(0)
        inner = plain_run_inner(base)
        return f"{pre}{inner}^{{{ascii}}}{post}"

    def plain_run_inner(s: str) -> str:
        for _ in range(5):
            before = s
            s = re.sub(
                r"([0-9a-zA-Z০-৯\]।]+)([" + _cls(_SUP_CLS) + r"]{1,12})",
                lambda m: m.group(0) if all(c in _SUB_SET for c in m.group(2))
                else f"{m.group(1)}^{{{''.join(_SUP_MAP.get(c, c) for c in m.group(2))}}}",
                s,
            )
            s = re.sub(
                r"([a-zA-Z০-৯]+)([" + _cls(_SUB_CLS) + r"]{1,6})",
                lambda m: f"\\{m.group(1)}_{{{''.join(_SUB_MAP.get(c, c) for c in m.group(2))}}}"
                if m.group(1) in ("log", "Log")
                else f"{m.group(1)}_{{{''.join(_SUB_MAP.get(c, c) for c in m.group(2))}}}",
                s,
            )
            if s == before:
                break
        return s
    s = re.sub(
        r"(\([^()$]{1,60}\)|[0-9a-zA-Z০-৯\]।\)]+)([" + _cls(_SUP_CLS) + r"]{1,12})",
        sup_repl,
        s,
    )
    # Base + subscript run, with upright \log. Guard mirrors the TS prose
    # pass: runs without a digit/sign/paren (logₐ, xₙ) stay raw Unicode.
    def sub_repl(m):
        base, run = m.group(1), m.group(2)
        ascii = "".join(_SUB_MAP.get(c, c) for c in run)
        if not (any(c.isdigit() or c in "+-()" for c in ascii) or ascii in ("x", "n")):
            return m.group(0)
        if base in ("log", "Log"):
            return f"{pre}\\{base}_{{{ascii}}}{post}"
        return f"{pre}{base}_{{{ascii}}}{post}"
    s = re.sub(
        r"([a-zA-Z০-৯]+)([" + _cls(_SUB_CLS) + r"]{1,6})",
        sub_repl,
        s,
    )
    return s


def text_of(node) -> str:
    """Plain w:t text under a node (runs, instrText excluded)."""
    return "".join(
        t.text or "" for t in node.iter() if t.tag in (W + "t", M + "t")
    )


def omath(node) -> str:
    """Linearize one OMML element to LaTeX fragment (no $ wrapper)."""
    tag = node.tag
    if tag == M + "t":
        # Raw text inside OMML: convert Unicode scripts to bare fragments
        # (the enclosing oMath already provides the $...$ wrapper).
        return plain_run(node.text or "", wrap=False)
    if tag in (M + "r", M + "e", M + "num", M + "den", M + "sub",
               M + "sup", M + "deg", M + "box", M + "name"):
        return "".join(omath(c) for c in node if isinstance(c.tag, str))
    if tag == M + "f":  # fraction → \frac
        num = den = ""
        for c in node:
            if c.tag == M + "num":
                num = "".join(omath(x) for x in c)
            elif c.tag == M + "den":
                den = "".join(omath(x) for x in c)
        return f"\\frac{{{num}}}{{{den}}}"
    if tag == M + "sSup":  # superscript → base^{sup}
        base = sup = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sup":
                sup = "".join(omath(x) for x in c)
        return f"{base}^{{{sup}}}"
    if tag == M + "sSub":  # subscript → base_{sub}
        base = sub = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sub":
                sub = "".join(omath(x) for x in c)
        if base.strip() == "log":
            return f"\\log_{{{sub}}}"
        return f"{base}_{{{sub}}}"
    if tag == M + "sSubSup":  # joint subscript+superscript
        base = sub = sup = ""
        for c in node:
            if c.tag == M + "e":
                base = "".join(omath(x) for x in c)
            elif c.tag == M + "sub":
                sub = "".join(omath(x) for x in c)
            elif c.tag == M + "sup":
                sup = "".join(omath(x) for x in c)
        out = base
        if sub:
            out += f"_{{{sub}}}"
        if sup:
            out += f"^{{{sup}}}"
        return out
    if tag == M + "sPre":  # n-ary with pre-script (rare) — unwrap
        return "".join(omath(c) for c in node if c.tag == M + "e")
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
            return f"\\sqrt[{deg}]{{{body}}}"
        return f"\\sqrt{{{body}}}"
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
        beg = {"[": "[", "{": "\\{", "": ""}.get(beg, beg)
        end = {"]": "]", "}": "\\}", "": ""}.get(end, end)
        # \left/\right only for real bracket pairs; bare bars stay literal.
        if beg in ("(", "[") and end in (")", "]"):
            return f"\\left{beg}{body}\\right{end}"
        return f"{beg}{body}{end}"
    if tag in (M + "nary",):  # Σ/∫/Π — keep operator + bounds loosely
        op = sub = sup = body = ""
        for c in node:
            if c.tag == M + "naryPr":
                for p in c:
                    if p.tag == M + "chr":
                        op = p.get(M + "val", "∑")
            elif c.tag == M + "sub":
                sub = "".join(omath(x) for x in c)
            elif c.tag == M + "sup":
                sup = "".join(omath(x) for x in c)
            elif c.tag == M + "e":
                body += "".join(omath(x) for x in c)
        op = {"∑": "\\sum ", "∏": "\\prod ", "∫": "\\int "}.get(op, latex_escape(op))
        out = op
        if sub:
            out += f"_{{{sub}}}"
        if sup:
            out += f"^{{{sup}}}"
        return out + (f" {body}" if body else "")
    if tag in (M + "oMathPara", M + "oMath"):
        inner = "".join(omath(c) for c in node if isinstance(c.tag, str))
        inner = re.sub(r"\s+", " ", inner).strip()
        return f"${inner}$" if inner else ""
    # properties / control nodes carry no content
    return ""


def para_text(p) -> str:
    parts = []
    for c in p:
        if c.tag == W + "r":
            parts.append(plain_run(text_of(c)))
        elif c.tag in (M + "oMath", M + "oMathPara"):
            parts.append(omath(c))
        elif c.tag == W + "hyperlink":
            parts.append(plain_run("".join(
                text_of(r) for r in c.iter(W + "r"))))
    # Merge "$a$ $b$" neighbours from split OMML runs into one span.
    return re.sub(r"\$\s+\$", " ", "".join(parts))


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(src) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    body = root.find(W + "body")
    out = []
    for p in body.findall(W + "p"):
        out.append(para_text(p).strip())
    text = "\n".join(out)
    while "\n\n\n\n" in text:
        text = text.replace("\n\n\n\n", "\n\n\n")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    print(f"wrote {dst} ({len(out)} paragraphs)")


if __name__ == "__main__":
    main()
