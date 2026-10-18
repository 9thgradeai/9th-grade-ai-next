import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | 9Th-Grade AI",
  description: "Internal admin console for the 9Th-Grade AI platform.",
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
