import { AppError } from "~backend/errors";
import type { ExamFamily } from "~backend/services/adaptive-exam/contracts";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../_shared";

const FAMILIES: readonly ExamFamily[] = ["BCS", "BANK", "OTHERS"];

export async function GET(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-profiles",
    handler: async () => {
      const url = new URL(request.url);
      const familyParam = url.searchParams.get("family");
      const profileId = url.searchParams.get("profileId") ?? undefined;
      if (familyParam && !(FAMILIES as readonly string[]).includes(familyParam)) {
        throw new AppError(400, "Invalid family filter.", "VALIDATION_ERROR");
      }
      const services = await createDefaultAdaptiveServices();
      const profiles = await services.catalog.profiles({
        ...(familyParam ? { family: familyParam as ExamFamily } : {}),
        ...(profileId ? { profileId } : {}),
      });
      return { profiles };
    },
  });
}
