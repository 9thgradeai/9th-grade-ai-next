/* GET/POST /api/ai/conversations — list and create AI conversations.
   Authenticated; every query is scoped to the user. */

import { NextResponse } from "next/server";
import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { createConversation, listConversations } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

const KINDS = new Set(["TUTOR", "ASSISTANT", "SOLVER"]);

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind")?.toUpperCase();
    const conversations = await listConversations(userId, KINDS.has(kind ?? "") ? (kind as "TUTOR" | "ASSISTANT" | "SOLVER") : undefined);

    const res = NextResponse.json({ conversations });
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
    if (!userId) throw new UnauthorizedError();

    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      title?: string;
      subjectId?: number;
      topicId?: number;
      topicPath?: string;
    };
    const kind = body.kind?.toUpperCase();
    if (!KINDS.has(kind ?? "")) {
      return NextResponse.json(
        { error: "kind must be TUTOR, ASSISTANT or SOLVER", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const conversation = await createConversation(userId, {
      kind: kind as "TUTOR" | "ASSISTANT" | "SOLVER",
      title: typeof body.title === "string" ? body.title : undefined,
      subjectId: typeof body.subjectId === "number" ? body.subjectId : undefined,
      topicId: typeof body.topicId === "number" ? body.topicId : undefined,
      topicPath: typeof body.topicPath === "string" ? body.topicPath : undefined,
    });

    const res = NextResponse.json({ conversation }, { status: 201 });
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