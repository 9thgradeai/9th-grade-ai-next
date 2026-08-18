/* POST /api/ai/tutor — streaming chat tutor for Bangladesh exam prep.
   A global AI assistant (no knowledge-base grounding): it answers from the
   model's own knowledge, focused on BCS / bank / teacher-recruitment / govt-job
   exam preparation. Streams text via the AI SDK using Groq. Falls back to a
   clearly-labelled mock stream when GROQ_API_KEY is not set. */

import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const TUTOR_PERSONA =
  "You are চর্চা AI, a friendly, expert AI assistant for Bangladesh competitive job exam preparation (BCS, Bangladesh Bank, Teacher Recruitment, 9th-grade government posts) and general education.\n" +
  "- Answer the student's question from your own knowledge, regardless of topic — you are a global assistant, not limited to a fixed syllabus.\n" +
  "- Answer in the same language the student writes in (Bengali/Bangla or English).\n" +
  "- Be accurate first. If you are unsure about a fact, say so instead of guessing.\n" +
  "- Be encouraging, concise, and exam-focused.\n" +
  "- For concepts, give a short explanation + a quick example or mnemonic.\n" +
  "- If asked to solve, show the steps clearly.";

const GROQ_MODEL = "openai/gpt-oss-120b";

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

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      const lastUser = messages[messages.length - 1]?.content ?? "";
      const mockReply =
        "ধন্যবাদ! এটি একটি মক (mock) উত্তর। (Set GROQ_API_KEY for real AI.)\n\n" +
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
          "X-AI-Source": "mock",
        },
      });
      applySecurityHeaders(res);
      return res;
    }

    // Global assistant: answer from the model's own knowledge, no KB grounding.
    const system = TUTOR_PERSONA;

    const groq = createGroq({ apiKey });
    const result = streamText({
      model: groq(GROQ_MODEL),
      system,
      messages,
      maxTokens: 2048,
    });

    const res = result.toTextStreamResponse();
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    res.headers.set("X-AI-Source", "groq");
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