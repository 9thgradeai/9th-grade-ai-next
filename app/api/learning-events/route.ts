import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { recordLearningEvents } from "~backend/services/learning-events";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse, ValidationError } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../_middleware";

/**
 * POST /api/learning-events — client-emitted product-analytics events.
 *
 * Strict allowlist: only funnel events the decision engine learns from.
 * Anything else is rejected — this is not a generic event sink (prevents
 * table garbage and keeps the analytics contract reviewable).
 */
const ALLOWED_TYPES = ["REC_ACCEPTED"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function validateBody(body: unknown): { type: AllowedType; metadata: Record<string, unknown> } {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be an object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.type !== "string" || !(ALLOWED_TYPES as readonly string[]).includes(b.type)) {
    throw new ValidationError(`type must be one of: ${ALLOWED_TYPES.join(", ")}.`);
  }
  if (b.metadata !== undefined && (typeof b.metadata !== "object" || b.metadata === null)) {
    throw new ValidationError("metadata must be an object when provided.");
  }
  return { type: b.type as AllowedType, metadata: (b.metadata ?? {}) as Record<string, unknown> };
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
    await assertSubmitAllowed(userId);

    const body = await request.json().catch(() => ({}));
    const { type, metadata } = validateBody(body);
    // JSON round-trip: strips undefined and yields plain JSON assignable to
    // Prisma's InputJsonValue (Record<string, unknown> is not, structurally).
    const metadataJson = JSON.parse(JSON.stringify(metadata)) as Record<string, string>;
    await recordLearningEvents([{ userId, type, occurredAt: new Date(), metadata: metadataJson }]);

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
