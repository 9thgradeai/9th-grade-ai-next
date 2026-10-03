"use client";

import { useLanguage, t } from "@/lib/lang-ctx";

type AISourceFooterProps = {
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  toolCount?: number | null;
  className?: string;
};

/**
 * Standard provenance footer for every AI output (Phase 2): provider · model
 * · latency · tool count, plus an always-visible Bengali mock warning when
 * the answer came from the labelled fallback. Extracted from ThreadView —
 * one component instead of six bespoke meta lines.
 */
export default function AISourceFooter({ provider, model, latencyMs, toolCount, className }: AISourceFooterProps) {
  const { lang } = useLanguage();
  const isMock = provider === "mock";
  return (
    <p className={`break-words font-mono text-[10px] leading-relaxed tracking-[0.12em] text-[var(--dashboard-text-muted)] ${className ?? ""}`}>
      {t(lang, "উৎস", "source")}: <span className="text-[var(--dashboard-primary)]">{provider ?? t(lang, "অজানা", "unset")}</span>
      {model ? ` · ${model}` : ""}
      {latencyMs !== undefined && latencyMs !== null && latencyMs > 0 ? ` · ${Math.round(latencyMs)}ms` : ""}
      {toolCount !== undefined && toolCount !== null ? ` · ${toolCount} tools` : ""}
      {isMock ? ` · ${t(lang, "(মক উত্তর — API কী সেট করা নেই, তথ্য যাচাই করুন)", "(mock answer — no API key set, verify facts)")}` : ""}
    </p>
  );
}
