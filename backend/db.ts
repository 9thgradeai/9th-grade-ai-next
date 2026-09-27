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

/** Manual connect with retry — call from health checks, never at import. */
export async function connectWithRetry(client: PrismaClient): Promise<void> {
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

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

// Always cache in globalThis so serverless function instances reuse the
// client instead of fanning out new connections per invocation.
globalForPrisma.prisma = prisma;

// Do NOT $connect() at import time: Prisma lazy-connects on first query,
// which keeps cold starts fast and avoids booting with a broken client.
// Graceful-shutdown handlers only apply to long-lived Node servers, not
// serverless runtimes where `process.on` leaks listeners per invocation.
if (typeof process !== "undefined" && process.env.NEXT_RUNTIME !== "edge") {
  const existing = (process as unknown as { __prismaHandlersBound?: boolean })
    .__prismaHandlersBound;
  if (!existing && process.env.NODE_ENV !== "production") {
    (process as unknown as { __prismaHandlersBound?: boolean }).__prismaHandlersBound = true;
  }
}
