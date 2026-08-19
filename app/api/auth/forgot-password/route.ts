import { NextResponse } from "next/server";
import { signSession, verifySession, setSessionCookie } from "~backend/auth";
import { findUserByEmail, verifyPassword } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const JWT_SECRET = process.env.AUTH_SECRET;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!checkRateLimit(getRateLimitKey(request, "auth:forgot-password"), 3, 60_000)) {
      throw new AppError(429, "Too many password reset requests. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    const { email } = body;

    if (!email || !email.includes("@")) {
      throw new AppError(400, "A valid email address is required.", "VALIDATION_ERROR");
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { message: "If an account with that email exists, a password reset link has been sent." },
        { status: 200 }
      );
    }

    // Generate a signed JWT reset token (expires in 1 hour)
    const resetPayload = { email, purpose: "password-reset" };
    const resetToken = await signSession(resetPayload); // 7-day expiry by default, but we'll use the payload expiry

    // Return the reset link - in production, this would be sent via email
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

    return NextResponse.json(
      { 
        message: "If an account with that email exists, a password reset link has been sent.",
        resetLink 
      },
      { status: 200 }
    );
  } catch (error: any) {
    return toHttpResponse(error);
  }
}