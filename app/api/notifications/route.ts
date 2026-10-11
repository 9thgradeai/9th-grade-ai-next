import { getNotifications, getUnreadCount } from "~backend/services/notification";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError } from "~backend/errors";
import { withHandler } from "../_middleware";

export const GET = withHandler(
  async (request: Request) => {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.has("limit")
      ? Math.min(50, Math.max(1, parseInt(searchParams.get("limit")!, 10)))
      : 20;
    const cursor = searchParams.has("cursor")
      ? parseInt(searchParams.get("cursor")!, 10)
      : undefined;
    const type = searchParams.get("type") ?? undefined;

    // Independent queries: fetch in parallel (async-parallel).
    const [{ items, nextCursor, total }, unreadCount] = await Promise.all([
      getNotifications(userId, { limit, cursorId: cursor, type }),
      // Filtering happens server-side (type is part of the query), so the
      // page, cursor and total are all consistent with the requested filter.
      getUnreadCount(userId),
    ]);

    return {
      notifications: items,
      total,
      nextCursor,
      unreadCount,
    };
  },
  { cache: { public: false, maxAge: 0 } },
);
