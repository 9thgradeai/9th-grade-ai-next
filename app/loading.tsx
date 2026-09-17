import { LoadingShell } from "@/components/ui/LoadingShell";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <LoadingShell
        title="LOADING"
        progressLabel="system boot"
      />
    </div>
  );
}
