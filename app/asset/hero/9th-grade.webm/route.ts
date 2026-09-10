import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Serves the hero background video at its canonical public URL.
 *
 * The source file lives at `assets/hero/9th-grade.webm` (outside `public/`,
 * so Next.js static serving does not cover it). This route resolves the exact
 * browser-facing path `/asset/hero/9th-grade.webm` without moving, renaming,
 * or duplicating the asset. The path is fixed — no user input participates —
 * so there is no traversal surface.
 *
 * Supports HTTP Range requests (206 Partial Content) so <video> elements can
 * stream/seek/loop efficiently; otherwise returns the full file (200).
 */
const VIDEO_PATH = join(process.cwd(), "assets", "hero", "9th-grade.webm");
const CONTENT_TYPE = "video/webm";
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const start = match[1] === "" ? size - Number(match[2]) : Number(match[1]);
  const end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

export async function GET(req: Request): Promise<NextResponse> {
  let size: number;
  try {
    size = (await stat(VIDEO_PATH)).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const baseHeaders = {
    "Content-Type": CONTENT_TYPE,
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE_CONTROL,
    "Content-Length": String(size),
  };

  const rangeHeader = req.headers.get("range");
  if (!rangeHeader) {
    const body = await readFile(VIDEO_PATH);
    return new NextResponse(new Uint8Array(body), { status: 200, headers: baseHeaders });
  }

  const range = parseRange(rangeHeader, size);
  if (!range) {
    return new NextResponse("Range not satisfiable", {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  const body = await readFile(VIDEO_PATH);
  const chunk = new Uint8Array(body).subarray(range.start, range.end + 1);
  return new NextResponse(chunk, {
    status: 206,
    headers: {
      "Content-Type": CONTENT_TYPE,
      "Accept-Ranges": "bytes",
      "Cache-Control": CACHE_CONTROL,
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
    },
  });
}
