import { describe, it, expect } from "vitest";
import { quickNormalize } from "@/lib/math/quick-normalize";

describe("quickNormalize — lightweight Unicode → LaTeX helper", () => {
  // ── Pass-through cases ──────────────────────────────────────────────────
  it("returns empty string unchanged", () => {
    expect(quickNormalize("")).toBe("");
  });

  it("passes through plain Bangla prose unchanged", () => {
    const text = "বিসিএস প্রস্তুতির জন্য গণিত চর্চা করুন।";
    expect(quickNormalize(text)).toBe(text);
  });

  it("passes through already-canonical $...$ spans unchanged", () => {
    const text = "যদি $x^{2}-5x+6=0$ হয়, তবে $x$ এর মান কত?";
    expect(quickNormalize(text)).toBe(text);
  });

  it("passes through $$...$$ display spans unchanged", () => {
    const text = "সমাধান করুন: $$\\frac{x+1}{x-1}=5$$";
    expect(quickNormalize(text)).toBe(text);
  });

  it("does not double-wrap already-canonical content", () => {
    const canonical = "Find $x^{2}$ for the equation.";
    // Idempotency: second pass must be identical
    expect(quickNormalize(quickNormalize(canonical))).toBe(quickNormalize(canonical));
  });

  // ── Superscript conversions ─────────────────────────────────────────────
  it("converts x² to $x^{2}$", () => {
    expect(quickNormalize("x²")).toContain("$x^{2}$");
  });

  it("converts x³ to $x^{3}$", () => {
    expect(quickNormalize("x³")).toContain("$x^{3}$");
  });

  it("converts 2ⁿ to $2^{n}$", () => {
    expect(quickNormalize("2ⁿ")).toContain("$2^{n}$");
  });

  // ── Subscript conversions ───────────────────────────────────────────────
  it("converts x₁ to $x_{1}$", () => {
    expect(quickNormalize("x₁")).toContain("$x_{1}$");
  });

  it("converts x₂ to $x_{2}$", () => {
    expect(quickNormalize("x₂")).toContain("$x_{2}$");
  });

  // ── Root conversions ────────────────────────────────────────────────────
  it("converts √x to $\\sqrt{x}$", () => {
    expect(quickNormalize("√x")).toContain("$\\sqrt{x}$");
  });

  it("converts √16 to $\\sqrt{16}$", () => {
    expect(quickNormalize("√16")).toContain("$\\sqrt{16}$");
  });

  it("converts ∛x to $\\sqrt[3]{x}$", () => {
    expect(quickNormalize("∛x")).toContain("$\\sqrt[3]{x}$");
  });

  it("converts ∜x to $\\sqrt[4]{x}$", () => {
    expect(quickNormalize("∜x")).toContain("$\\sqrt[4]{x}$");
  });

  // ── Mixed prose + math ──────────────────────────────────────────────────
  it("converts only the math token in a Bangla sentence", () => {
    const result = quickNormalize("যদি x² = 4 হয়");
    expect(result).toContain("$x^{2}$");
    expect(result).toContain("যদি");
    expect(result).toContain("= 4 হয়");
  });

  it("preserves existing $...$ while converting new Unicode math in same string", () => {
    const text = "Given $a^{2}+b^{2}$, find √c";
    const result = quickNormalize(text);
    // Existing span preserved exactly
    expect(result).toContain("$a^{2}+b^{2}$");
    // New math converted
    expect(result).toContain("$\\sqrt{c}$");
  });

  // ── Idempotency ─────────────────────────────────────────────────────────
  it("is idempotent on Bangla + Unicode math input", () => {
    const raw = "x² + y² = z² এবং √c = 2";
    const once = quickNormalize(raw);
    const twice = quickNormalize(once);
    expect(twice).toBe(once);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────
  it("handles null/undefined gracefully via falsy check", () => {
    // TypeScript would catch null at compile time, but test the runtime guard
    // @ts-expect-error intentional runtime test: null is not a valid input type
    expect(quickNormalize(null)).toBe("");
    // @ts-expect-error intentional runtime test: undefined is not a valid input type
    expect(quickNormalize(undefined)).toBe("");
  });
});
