import { NextResponse } from "next/server";
import { getVocabWords } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const { searchParams } = new URL(request.url);
    const letter = searchParams.get("letter") ?? ""; // A-Z or empty for all
    const userId = await getUserIdFromRequest(request);
    
    const words = await getVocabWords(userId ?? undefined);
    
    // Filter by letter if specified
    let filtered = words;
    if (letter && letter.length === 1 && /[a-zA-Z]/.test(letter)) {
      filtered = words.filter((w) => w.word.charAt(0).toUpperCase() === letter.toUpperCase());
    }
    
    // Sort alphabetically by word
    filtered.sort((a, b) => a.word.localeCompare(b.word));
    
    const res = NextResponse.json({ words: filtered, letter });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { public: false, maxAge: 0 });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime + "ms");
    applySecurityHeaders(res);
    return res;
  }
}
