// backend/db.ts — Prisma client singleton with retry logic, query logging, and graceful shutdown

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? (["query", "error", "warn"] as const)
        : (["error"] as const),
  });

  if (process.env.NODE_ENV === "development") {
    const SLOW_QUERY_THRESHOLD = 1000;
    client.$on("query", (event: { query: string; duration: number }) => {
      if (event.duration > SLOW_QUERY_THRESHOLD) {
        console.warn(`[Slow Query] ${event.duration}ms — ${event.query}`);
      }
    });
  }

  return client;
}

async function connectWithRetry(client: PrismaClient): Promise<void> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await client.$connect();
      return;
    } catch (error) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        console.error("Database connection failed after retries:", error);
        throw error;
      }
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
      console.warn(
        `Database connection attempt ${attempt} failed. Retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

connectWithRetry(prisma).catch((error) => {
  console.error("Failed to establish initial database connection:", error);
});

process.on("SIGINT", () => {
  prisma.$disconnect()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Shutdown error:", error);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  prisma.$disconnect()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Shutdown error:", error);
      process.exit(1);
    });
});
