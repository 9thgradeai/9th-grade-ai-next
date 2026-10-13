"use client";
import { LoadingShell } from "@/components/ui/LoadingShell";
import { useT } from "@/lib/i18n";

export default function DashboardLoading() {
  const t = useT();
  return (
    <LoadingShell
      title={t("dashboard.loadingDashboard")}
      progressLabel="dashboard boot"
      className="min-h-[420px]"
    />
  );
}
