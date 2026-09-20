import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/admin", "/onboarding", "/reset-password", "/verify-email", "/forgot-password"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
