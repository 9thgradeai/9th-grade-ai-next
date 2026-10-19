"use client";

import { useState } from "react";
import { SignOut, Spinner } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useT } from "@/lib/i18n";

interface LogoutButtonProps {
  variant?: "solid" | "ghost";
  className?: string;
  "aria-label"?: string;
}

export default function LogoutButton({
  variant = "ghost",
  className = "",
  "aria-label": ariaLabel,
}: LogoutButtonProps) {
  const t = useT();
  const { logout } = useAuth();
  const label = ariaLabel ?? t("auth.logoutLabel");
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } finally {
      setPending(false);
    }
  };

  const base =
    "inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed " +
    className;

  const content = pending ? (
    <>
      <Spinner className="w-4 h-4 animate-spin" aria-hidden="true" />
      <span>{t("auth.signingOut")}</span>
    </>
  ) : (
    <>
      <SignOut className="w-5 h-5" aria-hidden="true" />
      <span>{t("auth.logoutLabel")}</span>
    </>
  );

  if (variant === "solid") {
    return (
      <button
        onClick={() => void handleLogout()}
        disabled={pending}
        aria-label={label}
        className={
          "rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--danger)]/25 text-[var(--dashboard-danger)] px-4 py-2 min-h-11 hover:bg-[var(--dashboard-danger-subtle)] " +
          base
        }
      >
        {pending ? (
          <Spinner className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <SignOut className="w-4 h-4" aria-hidden="true" />
        )}
        {pending ? t("auth.signingOut") : t("auth.logoutLabel")}
      </button>
    );
  }

  return (
    <button
      onClick={() => void handleLogout()}
      disabled={pending}
      aria-label={label}
      className={
        // Muted-on-surface fails 4.5:1 for this small label; secondary meets
        // it in both themes. Danger still applies on hover/focus.
        "w-full min-h-[44px] rounded-xl px-3 py-2 text-left text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-danger)] hover:bg-[var(--dashboard-danger-subtle)] " +
        base
      }
    >
      {content}
    </button>
  );
}