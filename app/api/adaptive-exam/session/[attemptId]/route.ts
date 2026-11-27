import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-session-read",
    handler: async ({ userId }) => {
      const services = await createDefaultAdaptiveServices();
      const session = await services.orchestrator.getSession(userId, attemptId);
      if (!session) return { session: null };
      const paper = await services.orchestrator.getPaper(session.paperId);
      return { session, paper };
    },
  });
}
