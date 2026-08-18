/* POST /api/ai/tutor — streaming chat tutor for Bangladesh exam prep.
   Streams text back via the AI SDK. Falls back to a mock stream when no
   ANTHROPIC_API_KEY is set. */

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const SYSTEM_PROMPT = "You are চর্চা AI, a friendly, expert study tutor for Bangladesh competitive job exams (BCS, Bangladesh Bank, Assistant Director, 9th-grade government posts).\n\n- Answer in the same language the student writes in (Bengali/Bangla or English).\n- Be encouraging, concise, and exam-focused.\n- For concepts, give a short explanation + a quick example or mnemonic.\n- If asked to solve, show steps.";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!checkRateLimit(getRateLimitKey(request, "ai:tutor"), 10, 60_000)) {
      throw new AppError(429, "Too many AI requests. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AppError(400, "messages required", "VALIDATION_ERROR");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      const lastUser = messages[messages.length - 1]?.content ?? "";
      const mockReply =
        "ধন্যবাদ! এটি একটি মক (mock) উত্তর। (Set ANTHROPIC_API_KEY for real AI.)\n\n" +
        "আপনার প্রশ্ন: \"" + lastUser.slice(0, 120) + "\"\n\n" +
        "আমি বিষয়টি সহজভাবে বুঝিয়ে দেব। প্রথমে মূল ধারণাটি দেখি, তারপর একটি উদাহরণ দিব।";
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of mockReply.match(/.{1,12}(\s|$)/g) ?? [mockReply]) {
            controller.enqueue(encoder.encode(chunk));
            await new Promise((r) => setTimeout(r, 25));
          }
          controller.close();
        },
      });
      const res = new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Request-Id": requestId,
          "X-Response-Time": getTime() + "ms",
        },
      });
      applySecurityHeaders(res);
      return res;
    }

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: SYSTEM_PROMPT,
      messages,
      maxTokens: 1024,
    });

    const res = result.toTextStreamResponse();
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
