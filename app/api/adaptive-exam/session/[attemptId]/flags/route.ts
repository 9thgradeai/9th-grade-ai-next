import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  assertNoUnknownFields,
  requireBoolean,
  requireInteger,
  runAdaptiveRoute,
} from "../../../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-session-flags",
    needBody: true,
    handler: async ({ userId, body }) => {
      assertNoUnknownFields(body, ["position", "flagged", "expectedVersion"]);
      const position = requireInteger(body, "position", { min: 1, max: 300 });
      const flagged = requireBoolean(body, "flagged");
      const expectedVersion = body.expectedVersion === undefined
        ? undefined
        : requireInteger(body, "expectedVersion", { min: 1 });
      const services = await createDefaultAdaptiveServices();
      const session = await services.orchestrator.setFlag(
        userId,
        attemptId,
        position,
        flagged,
        expectedVersion,
      );
      return { session };
    },
  });
}
