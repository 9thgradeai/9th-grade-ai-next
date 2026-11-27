import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  adaptiveContext,
  assertNoUnknownFields,
  requireString,
  runAdaptiveRoute,
} from "../_shared";

export async function POST(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-generate",
    needBody: true,
    handler: async ({ userId, requestId, body }) => {
      assertNoUnknownFields(body, ["blueprintId", "idempotencyKey"]);
      const blueprintId = requireString(body, "blueprintId", { min: 3, max: 120 });
      const idempotencyKey = requireString(body, "idempotencyKey", { min: 8, max: 120 });

      const services = await createDefaultAdaptiveServices();
      const ctx = await adaptiveContext(userId, requestId);
      const job = await services.generationJobs.enqueue({ userId, blueprintId, idempotencyKey });
      const completed = await services.generationJobs.run(job.id, ctx);
      const paper = completed.paperId ? await services.orchestrator.getPaper(completed.paperId) : null;
      return { job: completed, paper };
    },
  });
}
