"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { useFarewellSafe } from "@/lib/farewell-ctx";

interface LogoutButtonProps {
  variant?: "solid" | "ghost";
  className?: string;
  "aria-label"?: string;
}

/**
 * Reusable sign-out control. When a LogoutFarewellProvider is present it opens
 * the cinematic farewell overlay (the session ends after the farewell plays);
 * otherwise it falls back to a direct logout.
 */
export default function LogoutButton({
  variant = "ghost",
  className = "",
  "aria-label": ariaLabel = "Log out",
}: LogoutButtonProps) {
  const { logout } = useAuth();
  const farewell = useFarewellSafe();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    if (pending) return;
    if (farewell) {
      farewell.beginLogout();
      return;
    }
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
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      <span>Signing out...</span>
    </>
  ) : (
    <>
      <LogOut className="w-5 h-5" aria-hidden="true" />
      <span>Log out</span>
    </>
  );

  if (variant === "solid") {
    return (
      <button
        onClick={() => void handleLogout()}
        disabled={pending}
        aria-label={ariaLabel}
        className={
          "rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 px-4 py-2 hover:bg-red-500/20 " +
          base
        }
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="w-4 h-4" aria-hidden="true" />
        )}
        {pending ? "Signing out..." : "Log out"}
      </button>
    );
  }

  return (
    <button
      onClick={() => void handleLogout()}
      disabled={pending}
      aria-label={ariaLabel}
      className={
        "w-full min-h-[44px] rounded-xl px-3 py-2 text-left text-zinc-400 hover:text-red-400 hover:bg-red-500/10 " +
        base
      }
    >
      {content}
    </button>
  );
}