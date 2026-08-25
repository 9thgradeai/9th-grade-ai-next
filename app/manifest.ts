import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "9Th-Grade AI — Exam Preparation",
    short_name: "9Th-Grade AI",
    description:
      "Free AI-powered exam preparation for Bangladeshi government job aspirants — BCS, Bank, and Teacher recruitment.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05070c",
    theme_color: "#10b981",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
