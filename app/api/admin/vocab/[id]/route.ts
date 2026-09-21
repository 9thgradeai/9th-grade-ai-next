import { NextResponse } from "next/server";
import { requireRole } from "~backend/services/user";
import { getVocabWord, updateVocabWord, deleteVocabWord } from "~backend/services/vocab-admin";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);
    const { id } = await params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      throw new AppError(400, "Invalid word ID", "VALIDATION_ERROR");
    }

    const word = await getVocabWord(numericId);

    const res = NextResponse.json({ word });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    await requireRole(request, ["admin"]);
    const { id } = await params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      throw new AppError(400, "Invalid word ID", "VALIDATION_ERROR");
    }

    const body = await request.json();
    const input: Record<string, unknown> = body;

    const updated = await updateVocabWord(numericId, {
      ...(typeof input.word === "string" && { word: input.word }),
      ...(typeof input.bengaliMeaning === "string" && { bengaliMeaning: input.bengaliMeaning }),
      ...(typeof input.partOfSpeech === "string" && { partOfSpeech: input.partOfSpeech }),
      ...(Array.isArray(input.verbForms) && { verbForms: input.verbForms }),
      ...(Array.isArray(input.synonyms) && { synonyms: input.synonyms }),
      ...(Array.isArray(input.antonyms) && { antonyms: input.antonyms }),
      ...(typeof input.exampleSentence === "string" && { exampleSentence: input.exampleSentence }),
      ...(typeof input.exampleSentenceBn === "string" && { exampleSentenceBn: input.exampleSentenceBn }),
      ...(typeof input.context === "string" && { context: input.context }),
      ...(typeof input.mnemonic === "string" && { mnemonic: input.mnemonic }),
      ...(Array.isArray(input.examRelevance) && { examRelevance: input.examRelevance }),
      ...(typeof input.frequency === "number" && { frequency: input.frequency }),
      ...(typeof input.difficulty === "string" && { difficulty: input.difficulty }),
    });

    const res = NextResponse.json({ word: updated });
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    await requireRole(request, ["admin"]);
    const { id } = await params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      throw new AppError(400, "Invalid word ID", "VALIDATION_ERROR");
    }

    const result = await deleteVocabWord(numericId);

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
