import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuthExperience from "@/components/auth/AuthExperience";

const h = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({
    login: h.login,
    register: h.register,
    logout: vi.fn(),
    user: null,
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function submitForm(name: string) {
  const button = screen.getByRole("button", { name });
  const form = button.closest("form");
  if (!form) throw new Error(`No form found for button ${name}`);
  fireEvent.submit(form);
}

describe("AuthExperience", () => {
  beforeEach(() => {
    h.login.mockReset();
    h.register.mockReset();
    h.push.mockReset();
    h.login.mockResolvedValue(undefined);
    h.register.mockResolvedValue(undefined);
  });

  it("opens in a dim room with the lamp as the only interaction", () => {
    render(<AuthExperience />);

    expect(screen.getAllByRole("button", { name: /turn on the light/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Do you already have an account?")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /friendly companion/i })).not.toBeInTheDocument();
  });

  it("turning on the light reveals the avatar and the account choice", async () => {
    render(<AuthExperience />);

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0]);

    await waitFor(
      () => {
        expect(screen.getByText("Do you already have an account?")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /i'm new here/i })).toBeInTheDocument();
      },
      { timeout: 2500 },
    );
    expect(screen.getByRole("img", { name: /friendly companion/i })).toBeInTheDocument();
  });

  it("signs in, celebrates, and continues to the dashboard", async () => {
    render(<AuthExperience />);

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument(), {
      timeout: 2000,
    });

    fireEvent.click(screen.getByRole("button", { name: /i have an account/i }));
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@9thgrade.ai" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    submitForm("Sign in");

    await waitFor(() => {
      expect(h.login).toHaveBeenCalledWith("demo@9thgrade.ai", "secret123", { redirect: false });
    });
    await waitFor(() => expect(screen.getByText("Welcome back. Let's go.")).toBeInTheDocument(), { timeout: 2000 });
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard"), { timeout: 2500 });
  });

  it("shows a human-friendly error and concerned avatar on failed login", async () => {
    h.login.mockRejectedValue(new Error("We couldn't sign you in with those details."));
    render(<AuthExperience />);

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument(), {
      timeout: 2000,
    });
    fireEvent.click(screen.getByRole("button", { name: /i have an account/i }));
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@9thgrade.ai" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrongpw" } });
    submitForm("Sign in");

    await waitFor(() =>
      expect(screen.getByText("We couldn't sign you in with those details.")).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText("Hmm... something didn't go as expected.")).toBeInTheDocument());
    expect(h.push).not.toHaveBeenCalled();
  });

  it("validates the signup form and submits a new account", async () => {
    render(<AuthExperience />);

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: /i'm new here/i })).toBeInTheDocument(), {
      timeout: 2000,
    });
    fireEvent.click(screen.getByRole("button", { name: /i'm new here/i }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument(), { timeout: 2000 });

    submitForm("Create account");
    expect(await screen.findByText("What should we call you?")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rahim Uddin" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rahim@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret999" } });
    submitForm("Create account");
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret123" } });
    submitForm("Create account");

    await waitFor(() => {
      expect(h.register).toHaveBeenCalledWith("Rahim Uddin", "rahim@example.com", "secret123", { redirect: false });
    });
    await waitFor(() => expect(screen.getByText("You're all set. ✨")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("honors ?register=true by going straight to signup after the lamp", async () => {
    render(<AuthExperience initialStage="signup" />);

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0]);

    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByText("Do you already have an account?")).not.toBeInTheDocument();
  });

  it("never renders audio (the avatar does not speak)", async () => {
    render(<AuthExperience />);
    expect(document.querySelector("audio")).toBeNull();
  });
});