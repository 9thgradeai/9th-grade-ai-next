import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import { runAdaptiveRoute } from "../_shared";

export async function GET(request: Request) {
  return runAdaptiveRoute(request, {
    bucket: "adaptive-catalog",
    handler: async () => {
      const services = await createDefaultAdaptiveServices();
      return { catalog: await services.catalog.catalog() };
    },
  });
}
