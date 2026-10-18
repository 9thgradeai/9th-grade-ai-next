import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/forgot-password",
  title: "Reset your password | 9Th-Grade AI",
  description:
    "Request a password reset link for your 9Th-Grade AI account.",
  noIndex: true,
});

import ForgotPasswordClient from "./ForgotPasswordClient"

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />
}
