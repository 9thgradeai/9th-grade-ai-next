import { AppError } from "~backend/errors";
import {
  adaptiveContext,
  assertNoUnknownFields,
  requireInteger,
  requireString,
  runAdaptiveRoute,
} from "../../../_shared";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import type { SubmitAdaptiveExamCommand } from "~backend/services/adaptive-exam/contracts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-session-submit",
    needBody: true,
    handler: async ({ userId, requestId, body }) => {
      assertNoUnknownFields(body, ["paperId", "answers", "durationSec", "idempotencyKey"]);
      const paperId = requireString(body, "paperId", { min: 3, max: 120 });
      const durationSec = requireInteger(body, "durationSec", { min: 0, max: 86_400 });
      const idempotencyKey = requireString(body, "idempotencyKey", { min: 8, max: 120 });
      if (!Array.isArray(body.answers) || body.answers.length > 300) {
        throw new AppError(400, "answers must be an array of at most 300 entries.", "VALIDATION_ERROR");
      }
      // The client echo is validated for shape only. Scoring always reads the
      // authoritative autosaved answers from the server-owned session.
      const answers: SubmitAdaptiveExamCommand["answers"] = [];
      for (const raw of body.answers) {
        if (!raw || typeof raw !== "object") throw new Error("Invalid answer entry.");
        const row = raw as Record<string, unknown>;
        if (typeof row.position !== "number" || !Number.isInteger(row.position)) {
          throw new AppError(400, "Invalid answer position.", "VALIDATION_ERROR");
        }
        if (typeof row.option !== "string" || !["A", "B", "C", "D"].includes(row.option)) {
          throw new AppError(400, "Invalid answer option.", "VALIDATION_ERROR");
        }
        answers.push({ position: row.position, option: row.option as "A" | "B" | "C" | "D" });
      }

      const services = await createDefaultAdaptiveServices();
      const ctx = await adaptiveContext(userId, requestId);
      const score = await services.orchestrator.submit(ctx, {
        userId,
        attemptId,
        paperId,
        answers,
        durationSec,
        idempotencyKey,
      });
      return { score };
    },
  });
}
