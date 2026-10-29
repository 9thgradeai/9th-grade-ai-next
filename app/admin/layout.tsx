import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUserFromCookies } from "~backend/auth";

export const metadata: Metadata = {
  title: "Admin | 9Th-Grade AI",
  description: "Internal admin console for the 9Th-Grade AI platform.",
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: true },
};

// Server-side gate: this layout runs before any admin markup is streamed to
// the browser. The /api/admin/* routes enforce the same role check, so hiding
// the page is defence-in-depth, never the only control.
//   • unauthenticated → /login
//   • authenticated non-admin → 404 (does not reveal that /admin exists)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");
  if (user.role !== "admin") notFound();
  return children;
}
