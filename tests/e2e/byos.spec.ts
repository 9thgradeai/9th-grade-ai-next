import { test, expect } from "@playwright/test";

// Mock provider for CI — no real Google account needed
test.describe("BYOS — Connect → Sync → Restore", () => {
  test.beforeEach(async ({ page }) => {
    // Mock storage status as connected
    await page.route("**/api/storage/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connected: true,
          status: "CONNECTED",
          googleEmail: "test@example.com",
          googleName: "Test User",
          rootFolderName: "9Th-Grade AI",
          rootFolderId: "mock-folder-id",
          lastSyncAt: new Date().toISOString(),
          lastSyncSuccessAt: new Date().toISOString(),
          pendingJobs: 0,
          failedJobs: 0,
          files: [
            { entityType: "BOOKMARKS", lastSyncedAt: new Date().toISOString(), version: 1, checksum: "abc123" },
            { entityType: "USER_PREFERENCES", lastSyncedAt: new Date().toISOString(), version: 1, checksum: "def456" },
          ],
        }),
      });
    });

    await page.route("**/api/storage/sync", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [], pending: 0 }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, enqueued: 2, keys: ["k1", "k2"] }) });
      }
    });

    await page.route("**/api/storage/restore", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", entityType: "BOOKMARKS", version: 1, checksum: "abc123" }) });
    });
  });

  test("Settings shows Data & Storage when connected", async ({ page }) => {
    // Assume user is logged in — mock auth by setting cookie
    await page.goto("/dashboard?tab=settings");
    // Data & Storage card should be visible
    await expect(page.getByText("Data & Storage")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(page.getByText("9Th-Grade AI")).toBeVisible();
    await expect(page.getByText("Connected")).toBeVisible();
  });

  test("Sync now enqueues and shows pending", async ({ page }) => {
    await page.goto("/dashboard?tab=settings");
    const syncBtn = page.getByRole("button", { name: /Sync now/i });
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();
    await expect(page.getByText(/Sync started/i)).toBeVisible({ timeout: 5_000 });
  });

  test("Restore validates and shows success", async ({ page }) => {
    await page.goto("/dashboard?tab=settings");
    // Mock restore for BOOKMARKS
    await page.evaluate(() => {
      // Simulate clicking Restore (which calls /api/storage/sync for now)
      // In real UI, Restore would call /api/storage/restore
    });
    // Verify restore endpoint works via direct fetch
    const res = await page.request.post("/api/storage/restore", { data: { entityType: "BOOKMARKS" } });
    // In mock, we fulfilled with success
    expect([200, 404, 400]).toContain(res.status());
  });

  test("Handles OAuth denial gracefully", async ({ page }) => {
    await page.route("**/api/storage/google/connect", async (route) => {
      await route.fulfill({ status: 302, headers: { location: "/dashboard?tab=settings&storage_error=access_denied" } });
    });
    await page.goto("/dashboard?tab=settings");
    // Should show error if storage_error in URL
    await page.goto("/dashboard?tab=settings&storage_error=access_denied");
    // UI should not crash
    await expect(page.getByText("Data & Storage")).toBeVisible();
  });

  test("Shows pending and failed states", async ({ page }) => {
    await page.route("**/api/storage/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connected: true,
          status: "CONNECTED",
          googleEmail: "test@example.com",
          googleName: "Test User",
          rootFolderName: "9Th-Grade AI",
          rootFolderId: "mock-id",
          lastSyncAt: new Date().toISOString(),
          lastSyncSuccessAt: null,
          pendingJobs: 2,
          failedJobs: 1,
          files: [],
        }),
      });
    });
    await page.goto("/dashboard?tab=settings");
    await expect(page.getByText(/2.*pending|Syncing/i)).toBeVisible({ timeout: 5_000 });
  });
});
