import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  const { paperId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-library-detail",
    handler: async ({ userId }) => {
      const services = await createDefaultAdaptiveServices();
      const entry = await services.library.get(paperId, userId);
      if (!entry) return { entry: null };
      return { entry };
    },
  });
}
