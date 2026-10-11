import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { AppError } from "~backend/errors";
import { withHandler } from "~app/api/_middleware";

function req(path = "http://localhost/api/test"): Request {
  return new Request(path);
}

describe("withHandler", () => {
  it("serializes plain-data returns as JSON with request headers", async () => {
    const GET = withHandler(async () => ({ ok: true }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(res.headers.get("X-Response-Time")).toMatch(/^\d+ms$/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("passes custom Responses through untouched (status, cookies)", async () => {
    const POST = withHandler(async () => {
      const res = NextResponse.json({ user: "u1" }, { status: 201 });
      res.cookies.set("auth_token", "tok", { httpOnly: true, path: "/" });
      return res;
    });
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ user: "u1" });
    expect(res.cookies.get("auth_token")?.value).toBe("tok");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("maps AppErrors to their HTTP shape", async () => {
    const GET = withHandler(async () => {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("propagates an inbound X-Request-Id instead of minting one", async () => {
    const GET = withHandler(async (_r, ctx) => ({ id: ctx.requestId }));
    const res = await GET(new Request("http://localhost/api/test", {
      headers: { "x-request-id": "req-123" },
    }));
    expect(res.headers.get("X-Request-Id")).toBe("req-123");
    expect(await res.json()).toEqual({ id: "req-123" });
  });

  it("applies CORS headers only when opted in", async () => {
    const plain = withHandler(async () => ({}));
    const corsed = withHandler(async () => ({}), { cors: true });
    const resPlain = await plain(req());
    expect(resPlain.headers.get("Access-Control-Allow-Methods")).toBeNull();
    const resCors = await corsed(req());
    expect(resCors.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("applies Cache-Control only when opted in", async () => {
    const GET = withHandler(async () => ({}), { cache: { public: false, maxAge: 0 } });
    const res = await GET(req());
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=0");
  });
});
