import { describe, it, expect, beforeEach } from "vitest";
import { applyCorsHeaders, readJsonBody } from "~app/api/_middleware";

const req = (origin?: string, host = "app.example.com") =>
  new Request("https://app.example.com/api/x", {
    headers: origin ? { origin, host } : { host },
  });

beforeEach(() => {
  delete process.env.ALLOWED_ORIGINS;
});

describe("applyCorsHeaders (Phase 1)", () => {
  it("echoes a same-origin request", () => {
    const res = new Response("ok");
    applyCorsHeaders(res, req("https://app.example.com"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("echoes an allowlisted cross-origin", () => {
    process.env.ALLOWED_ORIGINS = "https://cdn.example.com";
    const res = new Response("ok");
    applyCorsHeaders(res, req("https://cdn.example.com"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://cdn.example.com");
  });

  it("omits the header for a non-allowlisted origin (never '*' or '')", () => {
    process.env.ALLOWED_ORIGINS = "https://cdn.example.com";
    const res = new Response("ok");
    applyCorsHeaders(res, req("https://evil.example.com"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("omits the header when no origin and no allowlist exist", () => {
    const res = new Response("ok");
    applyCorsHeaders(res, req());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("readJsonBody (Phase 1)", () => {
  it("parses a normal body", async () => {
    const body = await readJsonBody(
      new Request("https://app.example.com/api/x", {
        method: "POST",
        body: JSON.stringify({ a: 1 }),
      }),
    );
    expect(body).toEqual({ a: 1 });
  });

  it("returns {} for an empty body", async () => {
    const body = await readJsonBody(
      new Request("https://app.example.com/api/x", { method: "POST" }),
    );
    expect(body).toEqual({});
  });

  it("rejects malformed JSON with 400", async () => {
    await expect(
      readJsonBody(
        new Request("https://app.example.com/api/x", { method: "POST", body: "{nope" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_BODY" });
  });

  it("rejects oversized bodies with 413", async () => {
    await expect(
      readJsonBody(
        new Request("https://app.example.com/api/x", {
          method: "POST",
          body: JSON.stringify({ big: "x".repeat(3000) }),
        }),
        100,
      ),
    ).rejects.toMatchObject({ statusCode: 413, code: "BODY_TOO_LARGE" });
  });
});
