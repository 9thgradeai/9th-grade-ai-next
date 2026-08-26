"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { account } from "@/lib/services/api";
import BrandMark from "@/components/ui/BrandMark";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"checking" | "ok" | "invalid">(token ? "checking" : "invalid");

  useEffect(() => {
    if (!token) return;
    let active = true;
    account
      .verifyEmail(token)
      .then((r) => active && setState(r.ok ? "ok" : "invalid"))
      .catch(() => active && setState("invalid"));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="mt-6 space-y-3">
      {state === "checking" && <p className="text-sm text-[var(--text-muted)]">Verifying your email…</p>}
      {state === "ok" && (
        <>
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Your email is verified. Welcome aboard!
          </p>
          <Link
            href="/dashboard"
            className="block text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
          >
            Go to your dashboard
          </Link>
        </>
      )}
      {state === "invalid" && (
        <>
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            This verification link is invalid or has expired.
          </p>
          <Link
            href="/login"
            className="block text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
          >
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold text-[var(--foreground)]">
        <BrandMark className="h-8 w-8 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
        9Th-Grade AI
      </Link>

      <div className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-panel sm:p-8">
        <h1 className="font-display text-xl font-semibold text-[var(--foreground)]">Email verification</h1>
        <Suspense fallback={<p className="mt-6 text-sm text-[var(--text-muted)]">Loading…</p>}>
          <VerifyInner />
        </Suspense>
      </div>
    </main>
  );
}
