"use client";

import { useEffect, useState } from "react";
import { getUsageSummary } from "@/lib/services/ai/usage";
import type { UsageSummaryDto } from "@/lib/services/ai/types";

export default function UsageTab() {
  const [data, setData] = useState<UsageSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getUsageSummary()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "ব্যবহার লোড করা যায়নি।"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div className="px-4 py-6 text-sm text-zinc-400">লোড হচ্ছে…</div>;
  if (error) return <div className="px-4 py-6 text-sm text-red-400">{error}</div>;
  if (!data) return null;

  const maxDay = Math.max(1, ...data.byDay.map((d) => d.calls));
  const maxProv = Math.max(1, ...data.byProvider.map((p) => p.calls));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">AI ব্যবহার ও পর্যবেক্ষণ</h1>
        <p className="mt-1 text-sm text-zinc-400">
          গত ১৪ দিনের তোমার নিজের AI ব্যবহার, খরচ এবং কার্যকারিতা।
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="মোট কল" value={String(data.totalCalls)} />
        <Stat label="মোট খরচ" value={`$${data.totalCostUsd.toFixed(4)}`} />
        <Stat label="সাফল্য হার" value={`${Math.round(data.successRate * 100)}%`} />
        <Stat label="গড় লেটেন্সি" value={`${data.avgLatencyMs}ms`} />
      </div>

      {data.byProvider.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">প্রোভাইডার অনুযায়ী</h3>
          <div className="space-y-2">
            {data.byProvider.map((p) => (
              <div key={p.provider} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-zinc-400">{p.provider}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(p.calls / maxProv) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs text-zinc-300">{p.calls}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.byDay.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">দৈনিক কল (১৪ দিন)</h3>
          <div className="flex items-end gap-1">
            {data.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.calls}`}>
                <div
                  className="w-full rounded-t bg-emerald-500/70"
                  style={{ height: `${Math.max(4, (d.calls / maxDay) * 64)}px` }}
                />
                <span className="text-[9px] text-zinc-500">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.totalCalls === 0 && (
        <p className="text-sm text-zinc-400">এখনো কোনো AI কল নেই। কোনো AI ফিচার ব্যবহার করলে এখানে পরিসংখ্যান দেখা যাবে।</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
