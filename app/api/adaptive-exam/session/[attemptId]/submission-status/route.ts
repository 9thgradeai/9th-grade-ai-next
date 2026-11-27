import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-submission-status",
    handler: async ({ userId }) => {
      const services = await createDefaultAdaptiveServices();
      const session = await services.orchestrator.getSession(userId, attemptId);
      if (!session) return { status: "NOT_FOUND" as const, score: null };
      const score = await services.ports.reportStore?.getScore(attemptId) ?? null;
      return {
        status: session.status,
        submittedAt: session.submittedAt ?? null,
        version: session.version,
        // Safe after an authoritative submit; never contains answers or keys.
        score,
      };
    },
  });
}
