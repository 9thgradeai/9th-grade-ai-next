"use client";

// Collapsible source-citation panel. Every fact in the
// daily note binds to one of these real, verified sources —
// the zero-hallucination contract of the agent.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CaretDown, ShieldCheck, ArrowSquareOut } from "@phosphor-icons/react";
import type { Server } from "@/lib/types";

interface CitationDrawerProps {
  citations: Server.CurrentAffairsCitationDTO[];
  title: string;
  badge: string;
}

export default function CitationDrawer({ citations, title, badge }: CitationDrawerProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-solid)" }}
      aria-label={title}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />
          <span className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{title}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }}
          >
            {citations.length}
          </span>
        </span>
        <CaretDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--dashboard-text-muted)" }}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ol className="space-y-2 border-t px-4 py-3" style={{ borderColor: "var(--dashboard-border-muted)" }}>
              {citations.map((c, i) => (
                <li
                  key={c.id}
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>
                        <span className="mr-1.5 font-mono text-[11px]" style={{ color: "var(--dashboard-primary)" }}>〔{i + 1}〕</span>
                        {c.articleTitle}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                        {c.publisher}
                        {c.publishedAt ? ` · ${new Date(c.publishedAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open source: ${c.articleTitle}`}
                      className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/5"
                      style={{ color: "var(--dashboard-primary)" }}
                    >
                      <ArrowSquareOut className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </div>
                  <p className="mt-1 break-all font-mono text-[10px]" style={{ color: "var(--dashboard-text-muted)" }}>
                    {c.sourceUrl}
                  </p>
                </li>
              ))}
            </ol>
            <p className="border-t px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }}>
              {badge}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
