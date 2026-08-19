import { NextResponse } from "next/server";
import { signSession, verifySession } from "~backend/auth";
import { findUserByEmail } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!checkRateLimit(getRateLimitKey(request, "auth:reset-password"), 5, 60_000)) {
      throw new AppError(429, "Too many password reset attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    const { token } = body;

    if (!token) {
      throw new AppError(400, "Reset token is required.", "VALIDATION_ERROR");
    }

    // Verify the reset token JWT
    const payload = await verifySession(token);
    if (!payload?.email || payload?.purpose !== "password-reset") {
      throw new AppError(400, "Invalid or expired reset token.", "RESET_TOKEN_INVALID");
    }

    // Return a success message - the actual password reset will be handled
    // by the frontend showing a form to set a new password
    // In a full implementation, the frontend would allow the user to set a new password
    return NextResponse.json(
      { message: "Please set a new password using the form below." },
      { status: 200 }
    );
  } catch (error: any) {
    return toHttpResponse(error);
  }
}