"use client";
import { Sparkles, MessageCircle, ArrowRight } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

export default function AITutorCard({ weakestName }: { weakestName: string | null }) {
  const { setActiveTab } = useDashboardStore();
  return (
    <div className="command-card command-card--glow p-5 sm:p-6 flex flex-col">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}><Sparkles className="w-3.5 h-3.5" /></span>
        <p className="command-eyebrow !text-[10px]">AI Tutor</p>
        <span className="ml-auto w-2 h-2 rounded-full status-dot-pulse" style={{ background: "var(--dashboard-success)" }} aria-hidden="true" />
      </div>
      <div className="mt-4 rounded-xl border p-4" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
          {weakestName ? (
            <>I&apos;ve noticed you&apos;re struggling with <span className="font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>{weakestName}</span>. Let&apos;s fix this together with a guided session.</>
          ) : (
            <>Ask me anything — Constitution, Math, English grammar — I&apos;m ready to help you revise smarter.</>
          )}
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => setActiveTab("practice")} className="command-primary-btn flex-1"><MessageCircle className="w-4 h-4" /> Ask AI Tutor</button>
        <button onClick={() => setActiveTab("practice")} className="command-secondary-btn">Guided Session <ArrowRight className="w-4 h-4" /></button>
      </div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>Native to your dashboard · private · never used for grading</p>
    </div>
  );
}
