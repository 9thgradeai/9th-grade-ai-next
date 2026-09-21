import { NextResponse } from "next/server";
import { getVocabDecks, createVocabDeck } from "~backend/services/vocab-decks";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse, ValidationError } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    const decks = await getVocabDecks(userId ?? undefined);
    const res = NextResponse.json({ decks });
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

export async function POST(request: Request) {
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

    const body = await request.json() as Record<string, unknown>;
    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      throw new ValidationError("Deck name is required");
    }

    const deck = await createVocabDeck(userId, {
      name: body.name as string,
      nameBn: body.nameBn as string | undefined,
      description: body.description as string | undefined,
      icon: body.icon as string | undefined,
      color: body.color as string | undefined,
    });

    const res = NextResponse.json({ deck }, { status: 201 });
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
