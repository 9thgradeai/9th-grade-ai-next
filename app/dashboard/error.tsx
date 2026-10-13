"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
      <div
        className="max-w-md w-full glass rounded-2xl border border-red-500/30 p-6 text-center"
        role="alert"
      >
        <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-mono font-bold text-xl mx-auto mb-4">
          !
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t("dashboard.error.title")}</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {t("dashboard.error.body")}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={retry}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--text-inverse)] text-sm rounded hover:bg-[var(--primary-hover)] transition-colors"
          >
            {t("dashboard.error.retry")}
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)] text-sm rounded hover:bg-[var(--surface-hover)] transition-colors"
          >
            {t("dashboard.error.reload")}
          </button>
        </div>
      </div>
    </div>
  );
}
