"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";

interface LogoutButtonProps {
  variant?: "solid" | "ghost";
  className?: string;
  "aria-label"?: string;
}

/**
 * Reusable sign-out control. Best-effort POST to /api/auth/logout then clears
 * local session state and returns the user to the landing page.
 */
export default function LogoutButton({
  variant = "ghost",
  className = "",
  "aria-label": ariaLabel = "Log out",
}: LogoutButtonProps) {
  const { logout } = useAuth();
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

  if (variant === "solid") {
    return (
      <button
        onClick={() => void handleLogout()}
        disabled={pending}
        aria-label={ariaLabel}
        className={
          "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-medium transition-colors hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed " +
          className
        }
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogOut className="w-4 h-4" aria-hidden="true" />}
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
        "inline-flex items-center gap-2 px-3 py-2 min-h-[44px] w-full rounded-xl text-left text-sm text-zinc-400 transition-colors hover:text-red-400 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed " +
        className
      }
    >
      {pending ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <LogOut className="w-5 h-5" aria-hidden="true" />}
      <span>{pending ? "Signing out..." : "Log out"}</span>
    </button>
  );
}