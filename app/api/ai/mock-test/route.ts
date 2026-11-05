/* POST /api/ai/mock-test — generate an AI mock test. Authenticated. */

/* PUT /api/ai/mock-test/save — save a generated test to the user's library. Authenticated. */

/* GET /api/ai/mock-history/:userId — retrieve user's saved mock tests. Authenticated. */

import { NextResponse } from "next/server";
import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { generateMockTest, saveMockTest, getUserMockTests } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin, readJsonBody } from "../../_middleware";

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to generate a mock test.");
    }

    await enforceAiQuotas(request, "solver", userId);

    const body = await readJsonBody(request);
    const { result, provider, model } = await generateMockTest({ userId, request: body });

    const res = NextResponse.json(result, {
      headers: {
        "X-AI-Source": provider,
        "X-AI-Model": model,
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
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

/* PUT /api/ai/mock-test/save — save a generated test to the user's library. Authenticated. */
export async function PUT(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to save a mock test.");
    }

    await enforceAiQuotas(request, "solver", userId);

    const body = await readJsonBody(request);
    const testData = body as {
      title: string;
      subject: string;
      count: number;
      difficulty: string | null;
      topics: string[];
      questions: Array<{
        id: string;
        question: string;
        options: Array<{ id: string; text: string }>;
        answer: string;
        explanation: string;
        topic: string;
        difficulty: string;
      }>;
      answers: Record<string, string>;
      createdAt: number;
    };

    const saved = await saveMockTest({
      userId,
      testData,
    });

    const res = NextResponse.json(saved, {
      headers: {
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
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

/* GET /api/ai/mock-history/:userId — retrieve user's saved mock tests. Authenticated. */
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to view mock test history.");
    }

    await enforceAiQuotas(request, "solver", userId);

    const tests = await getUserMockTests(userId);

    const res = NextResponse.json({ tests }, {
      headers: {
        "X-Request-Id": getRequestId(request) ?? "",
        "X-Response-Time": startTiming() + "ms",
      },
    });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", getRequestId(request) ?? "");
    res.headers.set("X-Response-Time", startTiming() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}