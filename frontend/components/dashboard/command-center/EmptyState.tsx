"use client";

import type { ReactNode } from "react";
import { Crosshair } from "@phosphor-icons/react";
import { useLanguage, t } from "@/lib/lang-ctx";

/**
 * Sprint 3 — the single Home empty pattern. One surface, one eyebrow voice,
 * one primary action. TodayMission's onboarding and future empty slots share
 * this shell instead of bespoke markup per section.
 */
export default function EmptyState({
  icon,
  eyebrow,
  title,
  titleId,
  body,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  eyebrow: string;
  title: string;
  titleId?: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { lang } = useLanguage();
  return (
    <div className="mt-3">
      <p className="command-eyebrow flex items-center gap-1.5">
        {icon ?? <Crosshair className="w-3.5 h-3.5" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />}
        {eyebrow}
      </p>
      <h2
        id={titleId}
        className="font-display font-black text-xl sm:text-2xl tracking-tight mt-3"
        style={{ color: "var(--dashboard-text-primary)" }}
      >
        {title}
      </h2>
      <p className="text-sm mt-1.5" style={{ color: "var(--dashboard-text-secondary)" }}>
        {body}
      </p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="command-primary-btn mt-4">
          {actionLabel}
          <span aria-hidden="true">→</span>
        </button>
      )}
      <p className="sr-only">{t(lang, "শুরু করতে উপরের বোতাম চাপুন", "Press the button above to begin")}</p>
    </div>
  );
}
