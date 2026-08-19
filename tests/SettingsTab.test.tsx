import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsTab from "@/components/dashboard/SettingsTab";
import LogoutButton from "@/components/dashboard/LogoutButton";
import type { Client } from "@/lib/types";

const h = vi.hoisted(() => ({
  mockUser: {
    id: "u1",
    name: "Rahim Uddin",
    email: "rahim@example.com",
    handle: "rahim",
    role: "student",
    createdAt: "2026-01-15T00:00:00.000Z",
  } as Client.User,
  logout: vi.fn(),
  updateProfile: vi.fn(),
  resetStore: vi.fn(),
  toggleTheme: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({
    user: h.mockUser,
    isLoading: false,
    logout: h.logout,
    updateProfile: h.updateProfile,
    tokenExpiry: Date.now() + 60_000,
  }),
}));

vi.mock("@/lib/theme-ctx", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: h.toggleTheme }),
}));

vi.mock("@/lib/store-ctx/dashboard", () => ({
  useDashboardStore: () => ({ lastSyncedAt: null, resetStore: h.resetStore }),
}));

vi.mock("@/lib/services/api", () => ({
  account: { changePassword: h.changePassword, deleteAccount: h.deleteAccount },
}));

describe("SettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.updateProfile.mockResolvedValue(h.mockUser);
    h.changePassword.mockResolvedValue({ success: true });
    h.deleteAccount.mockResolvedValue({ success: true });
    h.logout.mockResolvedValue(undefined);
  });

  it("renders the user's profile details", () => {
    render(<SettingsTab />);
    expect(screen.getByText("Rahim Uddin")).toBeInTheDocument();
    expect(screen.getAllByText("@rahim").length).toBeGreaterThan(0);
    expect(screen.getAllByText("rahim@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("exposes a sign-out control", () => {
    render(<SettingsTab />);
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("changes the password and reports success", async () => {
    render(<SettingsTab />);
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-pass" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-1" } });
    fireEvent.change(screen.getByLabelText("Confirm new"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText("Password changed successfully.")).toBeInTheDocument();
    expect(h.changePassword).toHaveBeenCalledWith("old-pass", "new-password-1", "new-password-1");
  });

  it("rejects mismatched password confirmation client-side", async () => {
    render(<SettingsTab />);
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-pass" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-1" } });
    fireEvent.change(screen.getByLabelText("Confirm new"), { target: { value: "different-1" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(h.changePassword).not.toHaveBeenCalled();
  });

  it("opens the delete confirmation modal and deletes the account", async () => {
    render(<SettingsTab />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(screen.getByText("Delete account?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));

    await waitFor(() => expect(h.deleteAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.logout).toHaveBeenCalledTimes(1));
  });
});

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls logout on click", () => {
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(h.logout).toHaveBeenCalledTimes(1);
  });
});