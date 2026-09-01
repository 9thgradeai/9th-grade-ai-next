import { LoadingShell } from "@/components/ui/LoadingShell";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <LoadingShell
        title="LOADING_TERMINAL"
        messages={["initializing terminal", "connecting to system", "preparing workspace"]}
        progressLabel="system boot"
      />
    </div>
  );
}
