import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  adaptiveContext,
  assertNoUnknownFields,
  requireString,
  runAdaptiveRoute,
} from "../../_shared";

export async function POST(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-session-start",
    needBody: true,
    handler: async ({ userId, requestId, body }) => {
      assertNoUnknownFields(body, ["paperId", "blueprintId", "idempotencyKey"]);
      const paperId = requireString(body, "paperId", { min: 3, max: 120 });
      const blueprintId = requireString(body, "blueprintId", { min: 3, max: 120 });
      const idempotencyKey = requireString(body, "idempotencyKey", { min: 8, max: 120 });

      const services = await createDefaultAdaptiveServices();
      const ctx = await adaptiveContext(userId, requestId);
      const session = await services.orchestrator.startSession(ctx, {
        userId,
        paperId,
        blueprintId,
        idempotencyKey,
      });
      const paper = await services.orchestrator.getPaper(paperId);
      return { session, paper };
    },
  });
}
