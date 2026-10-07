import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/lib/lang-ctx";

const h = vi.hoisted(() => ({
  notifications: vi.fn(),
  badges: vi.fn(),
}));

vi.mock("@/lib/services/api", () => ({
  api: {
    notifications: h.notifications,
    badges: h.badges,
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    deleteNotification: vi.fn(),
    notificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
  },
}));

import NotificationCenter from "@/components/dashboard/NotificationCenter";

describe("NotificationCenter badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.notifications.mockResolvedValue({
      notifications: [],
      total: 0,
      nextCursor: null,
      unreadCount: 3,
    });
    h.badges.mockResolvedValue([]);
  });

  it("fetches the unread count on mount so the bell badge is live", async () => {
    render(
      <LanguageProvider>
        <NotificationCenter />
      </LanguageProvider>,
    );
    await waitFor(() => expect(h.notifications).toHaveBeenCalled());
    expect(await screen.findByLabelText("Notifications (3 unread)")).toBeDefined();
  });
});
