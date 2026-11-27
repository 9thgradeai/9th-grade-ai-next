import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-job-status",
    handler: async ({ userId }) => {
      const services = await createDefaultAdaptiveServices();
      const job = await services.generationJobs.get(jobId, userId);
      if (!job) return { job: null };
      return { job };
    },
  });
}
