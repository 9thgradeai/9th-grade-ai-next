import { describe, it, expect } from "vitest";
import { validateQuestionSearchParams, ValidationError } from "~backend/validation";

describe("validateQuestionSearchParams — page support", () => {
  it("accepts a positive page and forwards it", () => {
    const params = new URLSearchParams("page=3&limit=50");
    const filters = validateQuestionSearchParams(params);
    expect(filters.page).toBe(3);
    expect(filters.limit).toBe(50);
  });

  it("omits page when absent", () => {
    const filters = validateQuestionSearchParams(new URLSearchParams(""));
    expect(filters.page).toBeUndefined();
  });

  it("rejects zero / negative / non-integer pages", () => {
    for (const bad of ["page=0", "page=-2", "page=1.5", "page=abc"]) {
      expect(() => validateQuestionSearchParams(new URLSearchParams(bad))).toThrow(
        ValidationError,
      );
    }
  });

  it("still rejects unknown query parameters alongside page", () => {
    expect(() =>
      validateQuestionSearchParams(new URLSearchParams("page=1&evil=1")),
    ).toThrow(ValidationError);
  });
});
