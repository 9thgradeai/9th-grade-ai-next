/* POST /api/ai/vocab — AI-powered vocabulary aids: mnemonics, contextual examples,
   word-of-the-day, and word relationships. Authenticated; non-streaming JSON responses. */

import { NextResponse } from "next/server";
import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import {
  generateMnemonic,
  generateContextualExamples,
  generateWordOfTheDay,
  explainWordRelationships,
} from "~backend/services/vocab-ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

type VocabAction = "mnemonic" | "examples" | "wordOfDay" | "relationships";

type VocabRequest = {
  action: VocabAction;
  word?: string;
  bengaliMeaning?: string;
  partOfSpeech?: string;
  difficulty?: string;
  context?: string;
  synonyms?: string[];
  antonyms?: string[];
};

function validateRequest(body: unknown): VocabRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }
  const b = body as Record<string, unknown>;
  const action = b.action as VocabAction | undefined;

  if (!action || !["mnemonic", "examples", "wordOfDay", "relationships"].includes(action)) {
    throw new Error("Invalid action. Must be: mnemonic, examples, wordOfDay, or relationships.");
  }

  if ((action === "mnemonic" || action === "examples" || action === "relationships") && !b.word) {
    throw new Error(`Word is required for action: ${action}`);
  }

  return {
    action,
    word: typeof b.word === "string" ? b.word : undefined,
    bengaliMeaning: typeof b.bengaliMeaning === "string" ? b.bengaliMeaning : undefined,
    partOfSpeech: typeof b.partOfSpeech === "string" ? b.partOfSpeech : undefined,
    difficulty: typeof b.difficulty === "string" ? b.difficulty : undefined,
    context: typeof b.context === "string" ? b.context : undefined,
    synonyms: Array.isArray(b.synonyms) ? (b.synonyms as string[]) : undefined,
    antonyms: Array.isArray(b.antonyms) ? (b.antonyms as string[]) : undefined,
  };
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use AI vocabulary features.");
    }

    const body = await request.json().catch(() => ({}));
    const req = validateRequest(body);

    let result: unknown;

    switch (req.action) {
      case "mnemonic":
        result = await generateMnemonic(
          req.word!,
          req.bengaliMeaning ?? "",
          req.context,
        );
        break;

      case "examples":
        result = await generateContextualExamples(
          req.word!,
          req.partOfSpeech ?? "Unknown",
          req.difficulty ?? "MEDIUM",
        );
        break;

      case "wordOfDay":
        result = await generateWordOfTheDay();
        break;

      case "relationships":
        result = await explainWordRelationships(
          req.word!,
          req.synonyms ?? [],
          req.antonyms ?? [],
        );
        break;
    }

    const res = NextResponse.json(result);
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
