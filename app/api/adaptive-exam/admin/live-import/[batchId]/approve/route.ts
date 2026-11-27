import { adaptiveContext, runAdaptiveRoute } from "../../../../_shared";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-admin-import-approve",
    adminOnly: true,
    handler: async ({ userId, requestId }) => {
      const services = await createDefaultAdaptiveServices();
      const ctx = await adaptiveContext(userId, requestId);
      await services.liveImport.approve(batchId, ctx);
      return { batchId, status: "APPROVED" };
    },
  });
}
