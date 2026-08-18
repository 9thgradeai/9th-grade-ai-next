/* POST /api/ai/solver — step-by-step question solver (text + optional image)
   Uses Anthropic Claude when ANTHROPIC_API_KEY is set; otherwise returns a
   clearly-labelled mock so local dev / CI works without a key. */

import { NextResponse } from "next/server";
import { generateText, CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const SYSTEM_PROMPT = "You are চর্চা AI, a patient, expert tutor for Bangladesh competitive job exams (BCS, Bangladesh Bank, Assistant Director, 9th-grade government posts). A student will give you a question — either typed or as an image.\n\nRespond with:\n1. A short, clear final answer.\n2. A numbered list of step-by-step reasoning (\"steps\").\n\nRules:\n- Keep explanations in simple Bengali (Bangla) and/or English as the student used.\n- Be concise and exam-focused.\n- For math, show the formula and the arithmetic.\n- If the question is ambiguous, state your assumption briefly.\n\nReturn JSON only, with this shape:\n{\n  \"solution\": \"<final answer with brief reasoning>\",\n  \"steps\": [\"step 1\", \"step 2\", \"...\"]\n}";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!checkRateLimit(getRateLimitKey(request, "ai:solver"), 10, 60_000)) {
      throw new AppError(429, "Too many AI requests. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    const { text, imageBase64, subject } = body;

    if ((!text && !imageBase64) || (typeof text !== "string" && typeof imageBase64 !== "string")) {
      throw new AppError(400, "Provide 'text' or 'imageBase64'.", "VALIDATION_ERROR");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const userPrompt = subject ? "[Subject: " + subject + "]\n\n" + (text ?? "See the attached image.") : (text ?? "See the attached image.");

    if (apiKey) {
      const anthropic = createAnthropic({ apiKey });
      const messages: CoreMessage[] = [
        {
          role: "user",
          content: imageBase64
            ? [
                { type: "text", text: userPrompt },
                {
                  type: "image",
                  image: "data:image/jpeg;base64," + imageBase64,
                },
              ]
            : userPrompt,
        },
      ];

      const { text: raw } = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        system: SYSTEM_PROMPT,
        messages,
        maxTokens: 1024,
      });

      try {
        const parsed = JSON.parse(raw);
        const res = NextResponse.json({ ...parsed, source: "anthropic" });
        res.headers.set("X-Request-Id", requestId);
        res.headers.set("X-Response-Time", getTime() + "ms");
        applySecurityHeaders(res);
        return res;
      } catch {
        const res = NextResponse.json({
          solution: raw,
          steps: ["AI generated the response above."],
          source: "anthropic",
        });
        res.headers.set("X-Request-Id", requestId);
        res.headers.set("X-Response-Time", getTime() + "ms");
        applySecurityHeaders(res);
        return res;
      }
    }

    await new Promise((r) => setTimeout(r, 800));
    const res = NextResponse.json({
      solution:
        "Based on the question provided, here's a step-by-step solution:\n\n1. Identify the key concepts and formulas involved.\n2. Apply the relevant principles to the given problem.\n3. Calculate step by step.\n4. Verify the answer.\n\n(This is a mock response. Set ANTHROPIC_API_KEY to get a real AI solution.)",
      steps: [
        "Analyzed the question and identified key concepts",
        "Applied relevant formulas and principles",
        "Computed the solution step by step",
        "Verified the final answer",
      ],
      source: "mock",
      note: "Set ANTHROPIC_API_KEY to enable the real AI solver.",
    });
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
