import { adaptiveContext, runAdaptiveRoute } from "../../../_shared";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-report",
    handler: async ({ userId, requestId }) => {
      const services = await createDefaultAdaptiveServices();
      const ctx = await adaptiveContext(userId, requestId);
      const report = await services.orchestrator.report(ctx, attemptId);
      return { report };
    },
  });
}
