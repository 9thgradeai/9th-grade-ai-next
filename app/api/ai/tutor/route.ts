/* POST /api/ai/tutor — streaming chat tutor for Bangladesh exam prep.
   A global AI assistant for BCS / bank / teacher-recruitment / govt-job exam
   preparation. When TAVILY_API_KEY is set it grounds factual answers in live
   web-search results; without it, it answers from the model's own knowledge.
   Generates the reply via the AI SDK on Groq (with retry-on-empty), then
   streams it. Falls back to a clearly-labelled mock stream when GROQ_API_KEY
   is not set. */

import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { searchWeb } from "../_search";
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

const WEB_RULES =
  "## Web Search Results (grounding)\n" +
  "Below are live web-search results retrieved for the student's question. Use them as your PRIMARY source for factual claims (names, dates, numbers, events).\n" +
  "- Answer from these results whenever they cover the question, and mention the source (e.g., the site name or URL).\n" +
  "- If the results are irrelevant, outdated, or do not cover the question, answer from your own knowledge and clearly say the facts come from your knowledge rather than a live search.\n" +
  "- Never invent facts that contradict the search results.\n\n" +
  "=== Retrieved web search results ===\n";

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

    // Global assistant. When a Tavily key is set, ground the answer in live
    // web search results for the latest message; otherwise answer from the
    // model's own knowledge.
    const latestQuestion = String(messages[messages.length - 1]?.content ?? "");
    const web = await searchWeb(latestQuestion);
    const webBlock = web.block
      ? `${WEB_RULES}\n${web.block}`
      : "";

    const system = `${TUTOR_PERSONA}\n\n${webBlock}`.trim();

    const groq = createGroq({ apiKey });

    // Groq's reasoning models intermittently return empty output and the free
    // tier rate-limits under load. Retry on both empty results and thrown
    // errors so the student always gets a real answer, then stream it out.
    let text = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await generateText({
          model: groq(GROQ_MODEL),
          system,
          messages,
          maxTokens: 2048,
        });
        if (result.text.trim()) {
          text = result.text;
          break;
        }
      } catch {
        // transient provider error — retry below
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }

    const finalText =
      text.trim() ||
      "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of finalText.match(/.{1,12}(\s|$)/g) ?? [finalText]) {
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
        "X-AI-Source": web.results > 0 ? "groq+web" : "groq",
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