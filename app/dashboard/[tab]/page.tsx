import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TABS, type TabId } from "@/lib/data";
import DashboardTabClient from "@/components/dashboard/DashboardTabClient";

// Each dashboard tab is a real URL (/dashboard/practice) so tabs are
// linkable, shareable and report analytics as distinct pages. They remain
// noindex: the dashboard is a private, auth-gated app surface.
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

// "HOME" → "Home", "QUESTION BANK" → "Question Bank"
function humanize(upper: string): string {
  return upper
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tab: string }>;
}): Promise<Metadata> {
  const { tab } = await params;
  const meta = TABS.find((t) => t.id === tab);
  if (!meta) return {};
  return {
    title: `${humanize(meta.label)} | 9Th-Grade AI`,
    description: `Your ${humanize(meta.label)} workspace on 9Th-Grade AI: AI-powered exam preparation for BCS, Bank, and teacher recruitment.`,
    alternates: { canonical: `/dashboard/${tab}` },
    robots: { index: false, follow: true },
  };
}

export function generateStaticParams() {
  return TABS.map((t) => ({ tab: t.id }));
}

export default async function DashboardTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!TAB_IDS.has(tab)) notFound();
  return <DashboardTabClient tab={tab as TabId} />;
}
