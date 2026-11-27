import { AppError } from "~backend/errors";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  assertNoUnknownFields,
  requireInteger,
  requireString,
  runAdaptiveRoute,
} from "../../../_shared";

export async function POST(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-admin-import",
    adminOnly: true,
    needBody: true,
    handler: async ({ body }) => {
      assertNoUnknownFields(body, ["profileId", "limit"]);
      const profileId = requireString(body, "profileId", { min: 3, max: 120 });
      const limit = body.limit === undefined
        ? undefined
        : requireInteger(body, "limit", { min: 1, max: 500 });

      const services = await createDefaultAdaptiveServices();
      const profile = await services.registry.resolve(profileId as never);
      if (!profile) {
        throw new AppError(404, "Adaptive profile not found.", "ADAPTIVE_PROFILE_NOT_FOUND");
      }
      const result = await services.liveImport.preview(profile, {
        ...(limit === undefined ? {} : { limit }),
      });
      // Records are staged with claimed answers only; no key is exposed.
      return {
        batchId: result.batchId,
        report: result.report,
        count: result.records.length,
        verification: "SOURCE_CLAIMED_OR_UNVERIFIED",
      };
    },
  });
}
