type StreakHeatmapProps = {
  activeDays: boolean[];
  labels: string[];
};

export default function StreakHeatmap({ activeDays, labels }: StreakHeatmapProps) {
  const days = activeDays.slice(-7);
  const dayLabels = labels.slice(-7);

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label="গত ৭ দিনের অধ্যয়ন">
      {days.map((active, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span
            className={`w-5 h-5 rounded-md border transition-colors ${
              active
                ? "bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.45)]"
                : "bg-zinc-800/60 border-zinc-700"
            }`}
            aria-hidden="true"
          />
          <span className="text-[9px] text-zinc-500 font-mono">{dayLabels[i]}</span>
        </div>
      ))}
    </div>
  );
}
