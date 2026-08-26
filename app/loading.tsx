/* src/app/loading.tsx */
export default function RootLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      <p className="text-emerald-500 font-mono text-sm tracking-widest animate-pulse motion-reduce:animate-none">LOADING_TERMINAL...</p>
      <div className="flex gap-1 mt-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
