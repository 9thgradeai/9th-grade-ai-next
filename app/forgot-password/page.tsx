"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { account } from "@/lib/services/api";
import BrandMark from "@/components/ui/BrandMark";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState<string | undefined>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    setDevLink(undefined);
    try {
      const res = await account.forgotPassword(email);
      setDevLink(res.devLink);
      setStatus("sent");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold text-[var(--foreground)]">
        <BrandMark className="h-8 w-8 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
        9Th-Grade AI
      </Link>

      <div className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-panel sm:p-8">
        <h1 className="font-display text-xl font-semibold text-[var(--foreground)]">Reset your password</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Enter the email on your account and we&rsquo;ll send a reset link.
        </p>

        {status === "sent" ? (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              If an account exists for that email, a reset link is on its way.
            </p>
            {devLink && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Dev mode (no email transport):{" "}
                <a href={devLink} className="underline break-all">
                  {devLink}
                </a>
              </p>
            )}
            <Link
              href="/login"
              className="block text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => { void onSubmit(e); }} className="mt-6 space-y-4">
            {status === "error" && message && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {message}
              </p>
            )}
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="btn-shine flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)] transition-all hover:shadow-[0_10px_32px_rgba(16,185,129,0.4)] active:scale-[0.98] disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Send reset link"}
            </button>
            <Link
              href="/login"
              className="block text-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
