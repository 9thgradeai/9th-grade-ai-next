import { NextResponse } from "next/server";
import { submitFlashcardReview, type FlashcardRating } from "~backend/services/flashcards";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import {
  assertNoUnknownFields,
  requirePositiveInteger,
  validateEnumValue,
} from "~backend/validation";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const RATINGS = [0, 1, 2, 3] as const; // again | hard | good | easy

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertNoUnknownFields(body, ["flashcardId", "rating"]);

    const flashcardId = requirePositiveInteger(body.flashcardId, "flashcardId");
    const rating = validateEnumValue(body.rating, RATINGS, "rating");
    if (rating === undefined) {
      throw new AppError(400, "rating is required.", "VALIDATION_ERROR");
    }

    const state = await submitFlashcardReview(userId, flashcardId, rating as FlashcardRating);

    const res = NextResponse.json({ state });
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
