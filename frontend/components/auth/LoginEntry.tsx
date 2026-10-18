"use client";

import { useSearchParams } from "next/navigation";
import AuthExperience from "./AuthExperience";

/** Reads ?error=… client-side so the /login route can stay static. */
export default function LoginEntry() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  return <AuthExperience initialError={error} />;
}
