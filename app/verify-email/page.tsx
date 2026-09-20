import type { Metadata } from "next";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
