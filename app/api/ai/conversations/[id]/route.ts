/* GET/PATCH/DELETE /api/ai/conversations/[id] — messages, rename, delete.
   Ownership is enforced: a user can only ever touch their own conversations. */

import { NextResponse } from "next/server";
import { UnauthorizedError, ValidationError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import {
  getConversation,
  listMessages,
  renameConversation,
  deleteConversation,
} from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders } from "../../../_middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();
    const { id } = await params;

    const [conversation, messages] = await Promise.all([
      getConversation(userId, id),
      listMessages(userId, id),
    ]);

    const res = NextResponse.json({ conversation, messages });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
    if (!title) throw new ValidationError("title is required.");

    const conversation = await renameConversation(userId, id, title);

    const res = NextResponse.json({ conversation });
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
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();
    const { id } = await params;

    await deleteConversation(userId, id);

    const res = NextResponse.json({ ok: true });
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