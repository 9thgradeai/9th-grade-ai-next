"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { AuthEnvironment } from "./AuthEnvironment"
import BrandMark from "@/components/ui/BrandMark"

/**
 * AuthShell — the shared frame for the secondary auth routes (recovery,
 * reset, verification). It drops each flow into the same cinematic room as
 * the sign-in / sign-up experience so the whole authentication surface reads
 * as one connected world rather than a set of disconnected cards. The
 * interior panel reuses the same `.glass-card` surface, typographic scale and
 * secure-session footer as the primary flow.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <AuthEnvironment state="ready">
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 pt-3 sm:px-8 sm:pt-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-[var(--foreground)] transition-opacity hover:opacity-85"
          >
            <BrandMark className="h-7 w-7 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
            9Th-Grade AI
          </Link>
          <Link
            href="/"
            className="rounded-lg px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400/80"
          >
            Back to home
          </Link>
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
          <div className="glass-card glow-border relative isolate w-full max-w-md overflow-hidden rounded-3xl border border-white/10 p-6 shadow-panel sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(rgb(45 212 191 / 0.9) 1px, transparent 1px), linear-gradient(90deg, rgb(45 212 191 / 0.9) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
                maskImage: "radial-gradient(120% 80% at 50% 0%, black, transparent 72%)",
                WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, black, transparent 72%)",
              }}
            />
            <div className="relative z-10">
              {eyebrow && (
                <p className="mb-2 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-emerald-400/80">
                  <span className="h-px w-5 bg-emerald-400/40" />
                  {eyebrow}
                  <span className="h-px w-5 bg-emerald-400/40" />
                </p>
              )}
              <h1 className="text-center font-display text-2xl font-semibold text-[var(--foreground)]">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 text-center text-sm text-[var(--text-muted)]">{description}</p>
              )}
              <div className="mt-6">{children}</div>
            </div>
          </div>
        </main>

        <footer className="flex items-center justify-center gap-1.5 pb-6 text-xs text-[var(--text-muted)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Secure session · Your password never leaves this page unhashed
        </footer>
      </div>
    </AuthEnvironment>
  )
}
