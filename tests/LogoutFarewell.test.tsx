import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogoutFarewellProvider, useFarewell } from "@/lib/farewell-ctx";

const h = vi.hoisted(() => ({
  logout: vi.fn(),
}));

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({
    logout: h.logout,
    user: { id: "u1", name: "Rahim", email: "r@e.com", handle: "rahim", role: "student", createdAt: "2026-01-01" },
    isLoading: false,
  }),
}));

function Harness() {
  const { beginLogout } = useFarewell();
  return <button onClick={beginLogout}>Log out</button>;
}

describe("LogoutFarewellProvider", () => {
  beforeEach(() => {
    h.logout.mockReset();
    h.logout.mockResolvedValue(undefined);
  });

  it("plays the farewell then logs the user out", async () => {
    render(
      <LogoutFarewellProvider>
        <Harness />
      </LogoutFarewellProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(screen.getByRole("dialog", { name: /logging out/i })).toBeInTheDocument();
    expect(screen.getByText("See you soon. 👋")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /actually, i'll stay/i })).toBeInTheDocument();

    await waitFor(() => expect(h.logout).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it("keeps the session when the user cancels", async () => {
    render(
      <LogoutFarewellProvider>
        <Harness />
      </LogoutFarewellProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    fireEvent.click(screen.getByRole("button", { name: /actually, i'll stay/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
    expect(h.logout).not.toHaveBeenCalled();
  });

  it("cancels on Escape", async () => {
    render(
      <LogoutFarewellProvider>
        <Harness />
      </LogoutFarewellProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
    expect(h.logout).not.toHaveBeenCalled();
  });
});