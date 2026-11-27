import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  assertNoUnknownFields,
  requireString,
  runAdaptiveRoute,
} from "../../../../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-admin-import-verify",
    adminOnly: true,
    needBody: true,
    handler: async ({ body }) => {
      assertNoUnknownFields(body, ["profileId"]);
      const profileId = requireString(body, "profileId", { min: 3, max: 120 });
      const services = await createDefaultAdaptiveServices();
      return {
        verification: await services.liveImport.verifyBatch(batchId, profileId as never),
      };
    },
  });
}
