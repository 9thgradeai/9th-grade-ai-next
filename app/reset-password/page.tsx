"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { account } from "@/lib/services/api";
import BrandMark from "@/components/ui/BrandMark";

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      await account.resetPassword(token, password);
      setStatus("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (!token) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        This reset link is missing its token. Request a new one.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => { void onSubmit(e); }} className="mt-6 space-y-4">
      {status === "error" && message && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {message}
        </p>
      )}
      <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="password">
        New password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        placeholder="At least 8 characters"
      />
      <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="confirm">
        Confirm new password
      </label>
      <input
        id="confirm"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="btn-shine flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)] transition-all hover:shadow-[0_10px_32px_rgba(16,185,129,0.4)] active:scale-[0.98] disabled:opacity-60"
      >
        {status === "saving" ? "Updating…" : "Update password"}
      </button>
      {status === "done" && (
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="block w-full text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
        >
          Password updated — continue to sign in
        </button>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold text-[var(--foreground)]">
        <BrandMark className="h-8 w-8 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
        9Th-Grade AI
      </Link>

      <div className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-panel sm:p-8">
        <h1 className="font-display text-xl font-semibold text-[var(--foreground)]">Choose a new password</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Pick a strong password for your account.</p>
        <Suspense fallback={<p className="mt-6 text-sm text-[var(--text-muted)]">Loading…</p>}>
          <ResetPasswordInner />
        </Suspense>
      </div>
    </main>
  );
}
