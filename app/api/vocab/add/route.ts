import { NextResponse } from "next/server";
import { addVocabWord } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return res;
    }
    const body = await request.json();
    const result = await addVocabWord(body);
    const res = NextResponse.json(result, { status: result.created ? 201 : 200 });
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
