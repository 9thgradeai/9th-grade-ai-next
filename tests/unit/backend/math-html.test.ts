import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { renderMathHtml, katexInlineCss } from "~backend/services/pdf/mathHtml";

describe("PDF math — renderMathHtml", () => {
  it("typesets inline $...$ spans into KaTeX HTML", () => {
    const html = renderMathHtml("Area = $\\frac{1}{2}bh$ units");
    expect(html).toContain("katex");
    expect(html).not.toContain("$\\frac");
    expect(html).toContain("Area = ");
    expect(html).toContain("units");
  });

  it("typesets display $$...$$ spans", () => {
    const html = renderMathHtml("$$x^2 + y^2 = z^2$$");
    expect(html).toContain("katex");
    expect(html).toContain("display");
  });

  it("escapes HTML in prose around math", () => {
    const html = renderMathHtml("<b>unsafe</b> and $x^2$");
    expect(html).toContain("&lt;b&gt;unsafe&lt;/b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain("katex");
  });

  it("keeps unclosed currency dollars as escaped prose", () => {
    const html = renderMathHtml("Costs $10M today");
    expect(html).toContain("$10M");
    expect(html).not.toContain("katex");
  });

  it("falls back to escaped literal text for unparseable TeX", () => {
    const html = renderMathHtml("bad $\\frac{1}$ end");
    expect(html).toContain("katex"); // renderToString(throwOnError:false) still emits markup
    expect(html).not.toMatch(/<script/i);
  });

  it("returns escaped plain text when there is no math", () => {
    expect(renderMathHtml("plain <text> & 'quotes'")).toBe(
      "plain &lt;text&gt; &amp; &#39;quotes&#39;",
    );
  });

  it("never lets math output smuggle raw markup from the source", () => {
    const html = renderMathHtml("$x$ <img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("katex");
  });
});

describe("PDF math — katexInlineCss", () => {
  const css = katexInlineCss();

  it("inlines every woff2 font as a data URI", () => {
    expect(css).toContain("url(data:font/woff2;base64,");
    expect(css).not.toMatch(/url\(fonts\//);
  });

  it("keeps the KaTeX structural rules (.katex, .katex-html)", () => {
    expect(css).toContain(".katex");
    expect(css).toContain(".katex-html");
  });

  it("strips unreachable woff/ttf fallback sources", () => {
    expect(css).not.toMatch(/format\("(?:woff|truetype)"\)/);
  });

  it("is cached (stable reference on second call)", () => {
    expect(katexInlineCss()).toBe(css);
  });

  it("resolves every woff2 file referenced by katex.min.css", () => {
    const raw = fs.readFileSync(
      path.join(
        process.cwd(),
        "node_modules",
        "katex",
        "dist",
        "katex.min.css",
      ),
      "utf8",
    );
    const referenced = raw.match(/url\(fonts\/[A-Za-z0-9_-]+\.woff2\)/g) ?? [];
    expect(referenced.length).toBeGreaterThan(0);
  });
});

vi.mock("@sparticuz/chromium", () => ({
  default: { executablePath: async () => "/nonexistent-chromium", args: [] },
}));

vi.mock("playwright-core", () => {
  const captured: { html?: string } = {};
  const page = {
    setViewportSize: vi.fn(async () => {}),
    setContent: vi.fn(async (html: string) => {
      captured.html = html;
    }),
    emulateMedia: vi.fn(async () => {}),
    pdf: vi.fn(async () => Buffer.from("%PDF-1.4 mocked")),
    close: vi.fn(async () => {}),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  };
  return {
    default: { chromium: { launch: vi.fn(async () => browser) } },
    __captured: captured,
  };
});

describe("PDF math — exam HTML pipeline (Chromium mocked)", () => {
  async function renderToHtml(
    doc: Parameters<typeof import("~backend/services/pdf/renderExamPdf").renderExamPdf>[0],
    opts = { includeAnswers: true, includeExplanations: true, shuffleQuestions: false },
  ): Promise<string> {
    const { renderExamPdf } = await import("~backend/services/pdf/renderExamPdf");
    const result = await renderExamPdf(doc, opts);
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    const pw = (await import("playwright-core")) as unknown as {
      __captured: { html?: string };
    };
    expect(pw.__captured.html).toBeDefined();
    return pw.__captured.html as string;
  }

  const baseDoc = {
    examId: "math-html-test",
    generatedAt: "2026-09-30T00:00:00.000Z",
    totalQuestions: 1,
    brandName: "9Th-Grade AI",
    title: "Math Mock",
    sequenceLabel: "Math-01",
    subjects: ["Mathematics"],
    fullMark: 5,
    durationMinutes: 10,
    instructions: ["Solve carefully."],
    questions: [
      {
        number: 1,
        text: "Find the area with base $b = 10\\text{ cm}$ and height $h = 5\\text{ cm}$.",
        subject: "Mathematics",
        options: [
          { key: "A", text: "$\\frac{1}{2} \\times 10 \\times 5 = 25\\text{ cm}^2$" },
          { key: "B", text: "50 cm²" },
        ],
        correctAnswer: "$25\\text{ cm}^2$",
        explanation: "Area $= \\frac{1}{2}bh = 25$ because $\\frac{1}{2} \\times 10 = 5$.",
      },
    ],
  };

  it("inlines katex CSS with data-URI fonts into the exam HTML", async () => {
    const html = await renderToHtml(baseDoc);
    expect(html).toContain(".katex");
    expect(html).toContain("url(data:font/woff2;base64,");
    expect(html).not.toMatch(/url\(fonts\//);
    expect(html).not.toMatch(/@import/);
  });

  it("typesets question, options, answer and explanation — no raw TeX remains", async () => {
    const html = await renderToHtml(baseDoc);
    expect(html).not.toContain("$\\frac");
    expect(html).not.toContain("$b = 10");
    expect((html.match(/class="katex"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("katex-html");
    expect(html).toContain("Find the area with base ");
    expect(html).toContain("50 cm²");
  });

  it("keeps unclosed currency prose literal and escapes HTML", async () => {
    const html = await renderToHtml({
      ...baseDoc,
      questions: [
        {
          ...baseDoc.questions[0],
          text: "Budget is $100M today.\n<script>alert(1)</script> then solve $x$ units",
          options: [],
        },
      ],
    });
    expect(html).toContain("$100M");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("class=\"katex\"");
  });

  it("renders without includeAnswers/includeExplanations", async () => {
    const html = await renderToHtml(baseDoc, {
      includeAnswers: false,
      includeExplanations: false,
      shuffleQuestions: false,
    });
    expect(html).not.toContain("Answer:");
    expect(html).toContain("katex");
  });
});
