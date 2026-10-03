import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { upsertUserNote } from "~backend/services/current-affairs";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { assertNoUnknownFields } from "~backend/validation";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

function isTipTapDoc(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertNoUnknownFields(body, ["dailyNoteId", "customContentJson"]);

    const dailyNoteId = body.dailyNoteId;
    if (typeof dailyNoteId !== "string" || dailyNoteId.length < 3 || dailyNoteId.length > 64) {
      throw new AppError(400, "dailyNoteId must be a valid note id.", "VALIDATION_ERROR");
    }

    if (!isTipTapDoc(body.customContentJson)) {
      throw new AppError(400, "customContentJson must be a TipTap doc JSON.", "VALIDATION_ERROR");
    }

    // Bound the payload — a note is a few KB, not a novel.
    const serialized = JSON.stringify(body.customContentJson);
    if (serialized.length > 256_000) {
      throw new AppError(413, "Note content is too large.", "NOTE_TOO_LARGE");
    }

    const { updatedAt } = await upsertUserNote(
      userId,
      dailyNoteId,
      body.customContentJson as Prisma.InputJsonValue,
    );

    const res = NextResponse.json({ updatedAt });
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
