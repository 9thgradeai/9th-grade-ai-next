import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
      <div className="max-w-md w-full glass rounded-terminal-rounded border border-terminal-border p-8 text-center">
        <div className="text-5xl font-mono font-bold text-emerald-500/20 mb-4">404</div>
        <h2 className="text-xl font-semibold text-white mb-2">Dashboard Sector Missing</h2>
        <p className="text-sm text-zinc-400 mb-6 font-mono">
          This section of the dashboard has not been initialized.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors"
        >
          RETURN_TO_DASHBOARD
        </Link>
      </div>
    </div>
  );
}
