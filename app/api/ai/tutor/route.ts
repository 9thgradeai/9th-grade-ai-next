/* POST /api/ai/tutor — streaming chat tutor for Bangladesh exam prep.
   Grounds answers in the curated knowledge base (frontend/lib/data/knowledge-base.ts)
   and streams text via the AI SDK using Groq (groq/compound). Falls back to a
   clearly-labelled mock stream when GROQ_API_KEY is not set. */

import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { retrieveKnowledge } from "@/lib/data/knowledge-base";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const TUTOR_PERSONA =
  "You are চর্চা AI, a friendly, expert study tutor for Bangladesh competitive job exams (BCS, Bangladesh Bank, Teacher Recruitment, 9th-grade government posts).\n" +
  "- Answer in the same language the student writes in (Bengali/Bangla or English).\n" +
  "- Be encouraging, concise, and exam-focused.\n" +
  "- For concepts, give a short explanation + a quick example or mnemonic.\n" +
  "- If asked to solve, show the steps clearly.";

const KB_RULES =
  "## Knowledge Base (grounding)\n" +
  "Below is a set of knowledge-base entries retrieved for this question. Treat them as your PRIMARY source of facts.\n" +
  "- Answer from these entries whenever they cover the question.\n" +
  "- If the entries do not cover the question, answer from your own general knowledge but say clearly that it is outside the knowledge base.\n" +
  "- Never invent facts that contradict the entries.\n" +
  "- Use the entries to correct the student's misunderstandings.\n\n" +
  "=== Retrieved knowledge base entries ===\n";

const GROQ_MODEL = "groq/compound";

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

    // Retrieve the most relevant knowledge-base entries for the latest message.
    const lastUserContent = String(messages[messages.length - 1]?.content ?? "");
    const kbEntries = retrieveKnowledge(lastUserContent, 8);
    const kbBlock =
      kbEntries.length > 0
        ? kbEntries.map((e, i) => `[KB ${i + 1}] বিষয়: ${e.topic} — ${e.subject}\n${e.content}`).join("\n\n")
        : "(কোনো মিলে যাওয়া নলেজ-বেস এন্ট্রি পাওয়া যায়নি — সাধারণ জ্ঞান থেকে উত্তর দিন এবং জানিয়ে দিন।)";

    const system = `${TUTOR_PERSONA}\n\n${KB_RULES}\n${kbBlock}`;

    const groq = createGroq({ apiKey });
    const result = streamText({
      model: groq(GROQ_MODEL),
      system,
      messages,
      maxTokens: 1024,
    });

    const res = result.toTextStreamResponse();
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    res.headers.set("X-AI-Source", kbEntries.length > 0 ? "groq+kb" : "groq");
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