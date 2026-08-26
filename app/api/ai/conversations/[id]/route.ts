/* GET/PATCH/DELETE /api/ai/conversations/[id] — messages, update, delete.
   Ownership is enforced: a user can only ever touch their own conversations. */

import { NextResponse } from "next/server";
import { UnauthorizedError, ValidationError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import {
  getConversation,
  listMessages,
  renameConversation,
  setConversationPinned,
  deleteConversation,
} from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";

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
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      pinned?: boolean;
    };

    let conversation;
    if (body.title !== undefined) {
      const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
      if (!title) throw new ValidationError("title is required.");
      conversation = await renameConversation(userId, id, title);
    } else if (body.pinned !== undefined) {
      if (typeof body.pinned !== "boolean") throw new ValidationError("pinned must be a boolean.");
      conversation = await setConversationPinned(userId, id, body.pinned);
    } else {
      throw new ValidationError("Provide a title or a pinned value.");
    }

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
    assertSameOrigin(request);
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