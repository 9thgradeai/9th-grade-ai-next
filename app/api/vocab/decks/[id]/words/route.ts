import { NextResponse } from "next/server";
import { getVocabDeckWords, addWordToDeck, removeWordFromDeck } from "~backend/services/vocab-decks";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse, ValidationError, NotFoundError } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../../_middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const { id: idStr } = await params;
    const deckId = parseInt(idStr, 10);
    if (isNaN(deckId)) throw new ValidationError("Invalid deck ID");

    const userId = await getUserIdFromRequest(request);
    const words = await getVocabDeckWords(deckId, userId ?? undefined);
    const res = NextResponse.json({ words });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      const res = NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });
      res.headers.set("X-Request-Id", requestId);
      applySecurityHeaders(res);
      return res;
    }

    const { id: idStr } = await params;
    const deckId = parseInt(idStr, 10);
    if (isNaN(deckId)) throw new ValidationError("Invalid deck ID");

    const body = await request.json() as Record<string, unknown>;
    if (!body.wordId || typeof body.wordId !== "number") {
      throw new ValidationError("wordId (number) is required");
    }

    await addWordToDeck(deckId, body.wordId);
    const res = NextResponse.json({ success: true });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      const res = NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });
      res.headers.set("X-Request-Id", requestId);
      applySecurityHeaders(res);
      return res;
    }

    const { id: idStr } = await params;
    const deckId = parseInt(idStr, 10);
    if (isNaN(deckId)) throw new ValidationError("Invalid deck ID");

    const body = await request.json() as Record<string, unknown>;
    if (!body.wordId || typeof body.wordId !== "number") {
      throw new ValidationError("wordId (number) is required");
    }

    await removeWordFromDeck(deckId, body.wordId);
    const res = NextResponse.json({ success: true });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}
