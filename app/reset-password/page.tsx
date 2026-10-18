import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = pageMeta({
  path: "/reset-password",
  title: "Set a new password | 9Th-Grade AI",
  description:
    "Choose a new password for your 9Th-Grade AI account.",
  noIndex: true,
});

export default function ResetPasswordPage() {
  // useSearchParams in the client requires a Suspense boundary for prerendering.
  return (
    <Suspense>
      <ResetPasswordClient />
    </Suspense>
  );
}
