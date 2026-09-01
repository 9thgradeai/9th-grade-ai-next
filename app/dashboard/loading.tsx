import { LoadingShell } from "@/components/ui/LoadingShell";

export default function DashboardLoading() {
  return (
    <LoadingShell
      title="LOADING_DASHBOARD"
      messages={["initializing modules", "syncing progress", "loading questions", "calibrating accuracy"]}
      progressLabel="dashboard boot"
      className="min-h-[420px]"
    />
  );
}
