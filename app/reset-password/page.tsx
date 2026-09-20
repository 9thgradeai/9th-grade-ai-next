import type { Metadata } from "next";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
