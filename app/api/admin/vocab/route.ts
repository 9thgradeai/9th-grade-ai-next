import { NextResponse } from "next/server";
import { requireRole } from "~backend/services/user";
import { listVocabWords, createVocabWord } from "~backend/services/vocab-admin";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
    const search = url.searchParams.get("search") ?? "";
    const difficulty = url.searchParams.get("difficulty") ?? undefined;

    const result = await listVocabWords({ page, limit, search, difficulty });

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

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    await requireRole(request, ["admin"]);

    const body = await request.json();
    const {
      word,
      bengaliMeaning,
      partOfSpeech,
      verbForms,
      synonyms,
      antonyms,
      exampleSentence,
      exampleSentenceBn,
      context,
      mnemonic,
      examRelevance,
      frequency,
      difficulty,
    } = body as Record<string, unknown>;

    if (!word || typeof word !== "string") {
      throw new AppError(400, "Word is required", "VALIDATION_ERROR");
    }
    if (!bengaliMeaning || typeof bengaliMeaning !== "string") {
      throw new AppError(400, "Bengali meaning is required", "VALIDATION_ERROR");
    }
    if (!partOfSpeech || typeof partOfSpeech !== "string") {
      throw new AppError(400, "Part of speech is required", "VALIDATION_ERROR");
    }
    if (!exampleSentence || typeof exampleSentence !== "string") {
      throw new AppError(400, "Example sentence is required", "VALIDATION_ERROR");
    }
    if (!context || typeof context !== "string") {
      throw new AppError(400, "Context is required", "VALIDATION_ERROR");
    }
    if (!mnemonic || typeof mnemonic !== "string") {
      throw new AppError(400, "Mnemonic is required", "VALIDATION_ERROR");
    }

    const created = await createVocabWord({
      word,
      bengaliMeaning,
      partOfSpeech,
      verbForms: Array.isArray(verbForms) ? verbForms : undefined,
      synonyms: Array.isArray(synonyms) ? synonyms : undefined,
      antonyms: Array.isArray(antonyms) ? antonyms : undefined,
      exampleSentence,
      exampleSentenceBn: typeof exampleSentenceBn === "string" ? exampleSentenceBn : undefined,
      context,
      mnemonic,
      examRelevance: Array.isArray(examRelevance) ? examRelevance : undefined,
      frequency: typeof frequency === "number" ? frequency : undefined,
      difficulty: typeof difficulty === "string" ? difficulty : undefined,
    });

    const res = NextResponse.json({ word: created }, { status: 201 });
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
