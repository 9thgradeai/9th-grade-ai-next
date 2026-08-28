// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";

const noop = () => {};

describe("LoginForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits with the 'stay signed in' checkbox value", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <LoginForm
        onSubmit={onSubmit}
        busy={false}
        error={null}
        onFocusChange={noop}
        onClearError={noop}
        onBack={noop}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "student@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "hunter2pass" },
    });
    fireEvent.click(screen.getByLabelText(/stay signed in/i));

    const form = screen.getByRole("button", { name: /sign in securely/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: "student@example.com",
        password: "hunter2pass",
        remember: true,
      }),
    );
  });

  it("shows the rate-limit backoff and disables submit while locked", () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <LoginForm
        onSubmit={onSubmit}
        busy={false}
        error="Locked out"
        onFocusChange={noop}
        onClearError={noop}
        onBack={noop}
        lockoutUntil={Date.now() + 5000}
      />,
    );

    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in securely/i })).toBeDisabled();
  });
});

describe("SignupForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the rate-limit backoff message while locked", () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <SignupForm
        onSubmit={onSubmit}
        busy={false}
        error={null}
        onFocusChange={noop}
        onClearError={noop}
        onBack={noop}
        lockoutUntil={Date.now() + 8000}
      />,
    );

    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
  });
});