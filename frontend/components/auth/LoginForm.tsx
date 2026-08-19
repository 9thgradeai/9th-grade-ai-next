"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthField } from "./AuthField";
import type { FocusField } from "./auth-state";

export type LoginValues = { email: string; password: string };

export function LoginForm({
  onSubmit,
  busy,
  error,
  onFocusChange,
  onClearError,
  onBack,
}: {
  onSubmit: (values: LoginValues) => Promise<void>;
  busy: boolean;
  error: string | null;
  onFocusChange: (field: FocusField) => void;
  onClearError: () => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!email.trim()) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "That doesn't look like a valid email.";
    if (!password) next.password = "Password is required.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;
    void onSubmit({ email: email.trim(), password });
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
      <AuthField
        id="login-email"
        label="Email"
        type="email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setFieldErrors((f) => ({ ...f, email: undefined }));
          onClearError();
        }}
        onFocus={() => onFocusChange("email")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.email}
        autoComplete="email"
        placeholder="you@example.com"
        inputMode="email"
      />
      <AuthField
        id="login-password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setFieldErrors((f) => ({ ...f, password: undefined }));
          onClearError();
        }}
        onFocus={() => onFocusChange("password")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.password}
        autoComplete="current-password"
        placeholder="Your password"
        rightSlot={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        }
      />

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? "Signing in..." : "Sign in"}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="self-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
      >
        ← Back
      </button>
    </form>
  );
}