import { AppError } from "~backend/errors";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  assertNoUnknownFields,
  optionalString,
  requireEnum,
  requireString,
  runAdaptiveRoute,
} from "../../../../_shared";

const STATUSES = ["UPCOMING", "PUBLISHED", "ARCHIVED"] as const;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  const { paperId } = await params;
  return runAdaptiveRoute(request, {
    bucket: "adaptive-admin-publication",
    adminOnly: true,
    needBody: true,
    handler: async ({ userId, body }) => {
      assertNoUnknownFields(body, ["status", "titleBn", "titleEn", "availableFrom", "availableTo"]);
      const status = requireEnum(body, "status", STATUSES);
      if (status === "UPCOMING" && body.availableFrom === undefined) {
        throw new AppError(400, "availableFrom is required when scheduling a mock.", "VALIDATION_ERROR");
      }
      const availableFrom = optionalString(body, "availableFrom", { min: 20, max: 40 });
      const availableTo = optionalString(body, "availableTo", { min: 20, max: 40 });
      for (const value of [availableFrom, availableTo]) {
        if (value && !ISO.test(value)) {
          throw new AppError(400, "Publication windows must be ISO timestamps.", "VALIDATION_ERROR");
        }
      }
      if (availableFrom && availableTo && availableFrom > availableTo) {
        throw new AppError(400, "availableTo must be after availableFrom.", "VALIDATION_ERROR");
      }

      const services = await createDefaultAdaptiveServices();
      const publication = await services.library.publish({
        paperId,
        status,
        titleBn: requireString(body, "titleBn", { min: 2, max: 200 }),
        titleEn: requireString(body, "titleEn", { min: 2, max: 200 }),
        ...(availableFrom ? { availableFrom } : {}),
        ...(availableTo ? { availableTo } : {}),
        actorId: userId,
      });
      return { publication };
    },
  });
}
