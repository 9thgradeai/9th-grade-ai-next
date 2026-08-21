import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { sourceKey } from "../../../scripts/seed-keys";

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

describe("sourceKey", () => {
  it("is deterministic for identical parts", () => {
    expect(sourceKey("a", "b", "c")).toBe(sourceKey("a", "b", "c"));
  });

  it("produces md5 hex of pipe-joined parts (parity with SQL backfill)", () => {
    expect(sourceKey("a", "b")).toBe(md5("a|b"));
    // Documented example pinned to a known md5 vector ("foobar" style check):
    expect(sourceKey("foo|bar")).toBe(md5("foo|bar"));
    expect(sourceKey(1, "p/x", "প্রশ্ন A?")).toBe(md5("1|p/x|প্রশ্ন A?"));
  });

  it("coerces null/undefined parts to empty strings (COALESCE parity)", () => {
    expect(sourceKey("a", null)).toBe(sourceKey("a", ""));
    expect(sourceKey(undefined, "b")).toBe(sourceKey("", "b"));
    expect(sourceKey("a", null, "c")).toBe(md5("a||c"));
  });

  it("is order-sensitive", () => {
    expect(sourceKey("a", "b")).not.toBe(sourceKey("b", "a"));
  });

  it("single-part keys equal their literal md5 even when containing pipes (SQL parity)", () => {
    // Inherent property of the pipe-join contract: md5("a|b") either way.
    // Cross-table collisions cannot occur because every unique index is
    // table-scoped (and Question's key is additionally scoped by subjectId).
    expect(sourceKey("a|b")).toBe(md5("a|b"));
    expect(sourceKey("a", "b")).toBe(md5("a|b"));
  });

  it("returns 32-char lowercase hex", () => {
    const key = sourceKey("x");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});
