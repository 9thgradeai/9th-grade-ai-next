// @vitest-environment node
//
// Asset-route tests for the hero background video.
// Verifies the canonical URL /asset/hero/9th-grade.webm resolves to the
// repo asset (assets/hero/9th-grade.webm) with correct media headers and
// HTTP Range support for <video> streaming.

import { describe, it, expect } from "vitest";

import { GET } from "~app/asset/hero/9th-grade.webm/route";

const BASE = "https://app.example.com";
const URL = `${BASE}/asset/hero/9th-grade.webm`;

describe("GET /asset/hero/9th-grade.webm", () => {
  it("returns the full video with media headers", async () => {
    const res = await GET(new Request(URL));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/webm");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBeGreaterThan(0);
    expect(res.headers.get("content-length")).toBe(String(body.byteLength));
  });

  it("supports Range requests for video streaming", async () => {
    const res = await GET(new Request(URL, { headers: { range: "bytes=0-99" } }));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("video/webm");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(100);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
  });

  it("rejects unsatisfiable ranges", async () => {
    const res = await GET(new Request(URL, { headers: { range: "bytes=999999999-1000000000" } }));
    expect(res.status).toBe(416);
  });
});
