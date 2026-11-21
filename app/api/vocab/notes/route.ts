import { NextResponse } from "next/server";
import {
  getVocabNotes,
  saveVocabNote,
  deleteVocabNote,
} from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  applyCacheHeaders,
  assertSameOrigin,
} from "../../_middleware";

function withHeaders(res: NextResponse, requestId: string, timing: () => number): NextResponse {
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-Response-Time", timing() + "ms");
  applyCacheHeaders(res, { public: false, maxAge: 0 });
  applySecurityHeaders(res);
  return res;
}

async function requireUser(request: Request): Promise<string> {
  const userId = await getUserIdFromRequest(request);
  if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
  return userId;
}

function parseWordId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, "A valid wordId is required", "VALIDATION_ERROR");
  }
  return id;
}

/** The user's integrated Vocab note, one entry per saved word. */
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await requireUser(request);
    const notes = await getVocabNotes(userId);
    return withHeaders(NextResponse.json({ notes }), requestId, getTime);
  } catch (err) {
    return withHeaders(toHttpResponse(err), requestId, getTime);
  }
}

/** Save or update the note attached to a word (upsert). */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await requireUser(request);
    const body = await request.json();
    const wordId = parseWordId(body?.wordId);
    const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : "";
    const saved = await saveVocabNote(userId, wordId, note);
    return withHeaders(NextResponse.json({ note: saved }), requestId, getTime);
  } catch (err) {
    return withHeaders(toHttpResponse(err), requestId, getTime);
  }
}

/** Remove a word from the user's note. */
export async function DELETE(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const wordId = parseWordId(body?.wordId ?? new URL(request.url).searchParams.get("wordId"));
    await deleteVocabNote(userId, wordId);
    return withHeaders(NextResponse.json({ ok: true }), requestId, getTime);
  } catch (err) {
    return withHeaders(toHttpResponse(err), requestId, getTime);
  }
}
