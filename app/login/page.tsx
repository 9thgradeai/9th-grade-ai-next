import { Suspense } from "react";
import type { Metadata } from "next";
import LoginEntry from "@/components/auth/LoginEntry";

export const metadata: Metadata = {
  title: "Sign in — 9Th-Grade AI",
  description: "Log in or create a free account to start your AI-powered exam preparation.",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginEntry />
    </Suspense>
  );
}
