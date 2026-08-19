"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthField } from "./AuthField";
import type { FocusField } from "./auth-state";

export type SignupValues = { name: string; email: string; password: string };

export function SignupForm({
  onSubmit,
  busy,
  error,
  onFocusChange,
  onClearError,
  onBack,
}: {
  onSubmit: (values: SignupValues) => Promise<void>;
  busy: boolean;
  error: string | null;
  onFocusChange: (field: FocusField) => void;
  onClearError: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = "What should we call you?";
    else if (name.trim().length < 2) next.name = "Name must be at least 2 characters.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "That doesn't look like a valid email.";
    if (!password) next.password = "Create a password.";
    else if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;
    void onSubmit({ name: name.trim(), email: email.trim(), password });
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
      <AuthField
        id="signup-name"
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          setFieldErrors((f) => ({ ...f, name: undefined }));
          onClearError();
        }}
        onFocus={() => onFocusChange("name")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.name}
        autoComplete="name"
        placeholder="Rahim Uddin"
      />
      <AuthField
        id="signup-email"
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
        id="signup-password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setFieldErrors((f) => ({ ...f, password: undefined, confirm: undefined }));
          onClearError();
        }}
        onFocus={() => onFocusChange("password")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.password}
        autoComplete="new-password"
        placeholder="At least 8 characters"
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
      <AuthField
        id="signup-confirm"
        label="Confirm password"
        type={showPassword ? "text" : "password"}
        value={confirm}
        onChange={(v) => {
          setConfirm(v);
          setFieldErrors((f) => ({ ...f, confirm: undefined }));
          onClearError();
        }}
        onFocus={() => onFocusChange("confirm")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.confirm}
        autoComplete="new-password"
        placeholder="Repeat your password"
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
        {busy ? "Creating account..." : "Create account"}
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