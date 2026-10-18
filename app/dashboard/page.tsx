import { redirect } from "next/navigation";
import { TABS } from "@/lib/data";

// Every dashboard tab now lives at a real URL (/dashboard/<tab>). The bare
// /dashboard index redirects there, preserving the tab and any intent query
// params so legacy deep links (/dashboard?tab=practice&mode=quick) keep
// working. Tab paths are noindex; the dashboard is a private app surface.
export const metadata = {
  title: "Dashboard | 9Th-Grade AI",
  robots: { index: false, follow: true },
};

export default async function DashboardIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : undefined;
  const isValidTab = tab !== undefined && TABS.some((t) => t.id === tab);

  // Rebuild the query string without `tab` (it becomes a path segment).
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "tab" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) rest.append(key, v);
  }
  const qs = rest.toString();

  redirect(`/dashboard/${isValidTab ? tab : "home"}${qs ? `?${qs}` : ""}`);
}
