import type { OptionKey } from "~backend/services/adaptive-exam/contracts";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  assertNoUnknownFields,
  requireEnum,
  requireInteger,
  runAdaptiveRoute,
} from "../../../_shared";

const OPTIONS = ["A", "B", "C", "D"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-session-answers",
    needBody: true,
    handler: async ({ userId, body }) => {
      assertNoUnknownFields(body, ["position", "option", "expectedVersion"]);
      const position = requireInteger(body, "position", { min: 1, max: 300 });
      const option = requireEnum(body, "option", OPTIONS) as OptionKey;
      const expectedVersion = body.expectedVersion === undefined
        ? undefined
        : requireInteger(body, "expectedVersion", { min: 1 });
      const services = await createDefaultAdaptiveServices();
      const session = await services.orchestrator.recordAnswer(
        userId,
        attemptId,
        position,
        option,
        expectedVersion,
      );
      return { session };
    },
  });
}
