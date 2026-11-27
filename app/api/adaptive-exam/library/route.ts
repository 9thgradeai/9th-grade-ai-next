import { AppError } from "~backend/errors";
import type { ExamFamily, PublicationStatus } from "~backend/services/adaptive-exam/contracts";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../_shared";

const FAMILIES: readonly ExamFamily[] = ["BCS", "BANK", "OTHERS"];
const STATUSES: readonly PublicationStatus[] = ["DRAFT", "UPCOMING", "PUBLISHED", "ARCHIVED"];

export async function GET(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-library",
    handler: async () => {
      const url = new URL(request.url);
      const family = url.searchParams.get("family") ?? undefined;
      const profileId = url.searchParams.get("profileId") ?? undefined;
      const subjectId = url.searchParams.get("subjectId") ?? undefined;
      const status = url.searchParams.get("status") ?? undefined;
      if (family && !(FAMILIES as readonly string[]).includes(family)) {
        throw new AppError(400, "Invalid family filter.", "VALIDATION_ERROR");
      }
      if (status && !(STATUSES as readonly string[]).includes(status)) {
        throw new AppError(400, "Invalid status filter.", "VALIDATION_ERROR");
      }
      const services = await createDefaultAdaptiveServices();
      const entries = await services.library.list({
        ...(family ? { family: family as ExamFamily } : {}),
        ...(profileId ? { profileId } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(status ? { status: status as PublicationStatus } : {}),
      });
      // Metadata-only rows never carry a paper field.
      return { entries };
    },
  });
}
