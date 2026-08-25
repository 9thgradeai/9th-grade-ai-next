"use client"

import { useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ScanLine } from "lucide-react"
import BrandMark from "@/components/ui/BrandMark"
import Interactive3DCard from "@/components/landing/Interactive3DCard"

/**
 * The product's own success ceremony: a stylized admit card that materializes
 * when authentication succeeds — the same ritual every Bangladeshi aspirant
 * knows from real exam form-fill-up.
 *
 * The serial/seat are deterministic decorations derived from the account
 * email (pure hash → stable across visits); they are celebratory visuals,
 * never presented as real examination data. "VALID 7 DAYS" mirrors the actual
 * JWT session length, so even the flourish is honest.
 */

function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function deriveDisplayName(email: string, providedName?: string): string {
  if (providedName?.trim()) return providedName.trim()
  const local = email.split("@")[0] ?? ""
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Aspirant"
}

const BAR_WIDTHS = [3, 1.5, 2.5, 1.5, 4, 1.5, 2, 3.5, 1.5, 2.5, 2, 4, 1.5, 2, 3, 1.5]

export function AdmitCard({
  name,
  email,
  kind,
}: {
  name: string
  email: string
  kind: "login" | "signup"
}) {
  const reduced = useReducedMotion()

  const { serial, seat, bars } = useMemo(() => {
    const hash = fnv1a(email.trim().toLowerCase())
    return {
      serial: `9G-${String(hash % 100000).padStart(5, "0")}`,
      seat: String((hash % 900) + 101),
      bars: BAR_WIDTHS.map((w, i) => (hash >> i % 24 & 1 ? w + 1 : w)),
    }
  }, [email])

  const issued = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  return (
    <Interactive3DCard maxRotation={5} glow className="rounded-2xl">
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, rotateY: -80, y: 14 }}
      animate={{ opacity: 1, rotateY: 0, y: 0 }}
      transition={reduced ? { duration: 0.25 } : { type: "spring", stiffness: 210, damping: 22 }}
      style={{ transformStyle: "preserve-3d" }}
      className="relative w-full overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-[#0b1120]/95 via-[#0a1626]/95 to-[#07202b]/95 shadow-[0_20px_60px_rgba(2,6,12,0.55),0_0_40px_rgba(16,185,129,0.10)]"
    >
      {/* Paper grain + top sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(120% 70% at 18% 0%, rgba(234,255,251,0.06), transparent 55%)," +
            "repeating-linear-gradient(115deg, rgba(234,255,251,0.02) 0 2px, transparent 2px 5px)",
        }}
      />

      {/* Verification stamp — physical, slightly rotated, pops in late */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-9 z-20 -rotate-[9deg]"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          reduced
            ? { duration: 0.3, delay: 0.5 }
            : { type: "spring", stiffness: 420, damping: 16, delay: 0.85 }
        }
      >
        <span className="block rounded-md border-2 border-emerald-400/80 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.25)]">
          ✓ Authenticated
        </span>
      </motion.div>

      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-dashed border-white/15 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7 rounded-lg" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-400">
              9th-Grade AI · Admit Card
            </p>
            <p className="font-mono text-[10px] text-zinc-500">Serial {serial}</p>
          </div>
        </div>
        <ScanLine className="h-4 w-4 text-emerald-400/70" aria-hidden="true" />
      </div>

      {/* Body */}
      <div className="px-5 pb-4 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Candidate</p>
        <p className="mt-0.5 truncate font-display text-xl font-semibold text-white">{name}</p>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-left">
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Seat</dt>
            <dd className="font-display text-sm font-semibold tabular-nums text-emerald-300">{seat}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Issued</dt>
            <dd className="font-display text-sm font-semibold text-zinc-200">{issued}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Status</dt>
            <dd className="flex items-center gap-1 font-display text-sm font-semibold text-emerald-300">
              <span aria-hidden="true" className="pulse-soft h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Valid
            </dd>
          </div>
        </dl>
      </div>

      {/* Perforation */}
      <div aria-hidden="true" className="relative">
        <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#04060c]" />
        <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#04060c]" />
        <div className="mx-4 border-t border-dashed border-white/15" />
      </div>

      {/* Stub with barcode */}
      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
            {kind === "signup" ? "New Aspirant" : "Returning Examinee"}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-emerald-400/90">Session valid · 7 days</p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
            Candidate verified · Registrar: Unit-9
          </p>
        </div>
        <div aria-hidden="true" className="flex h-8 items-end gap-[3px]" >
          {bars.map((width, i) => (
            <motion.span
              key={i}
              initial={reduced ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={reduced ? undefined : { duration: 0.3, delay: 0.35 + i * 0.03 }}
              style={{ width, originY: 1 }}
              className={`inline-block ${i % 3 === 0 ? "bg-emerald-400/70" : "bg-zinc-400/60"}`}
            />
          ))}
        </div>
      </div>
    </motion.div>
    </Interactive3DCard>
  )
}
