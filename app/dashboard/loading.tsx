import { LoadingShell } from "@/components/ui/LoadingShell";

export default function DashboardLoading() {
  return (
    <LoadingShell
      title="LOADING_DASHBOARD"
      progressLabel="dashboard boot"
      className="min-h-[420px]"
    />
  );
}
