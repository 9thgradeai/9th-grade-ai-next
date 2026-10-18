/**
 * Canonical site identity for metadata, JSON-LD, and sitemap-style URLs.
 *
 * `NEXT_PUBLIC_SITE_URL` is the single source of truth and is inlined into
 * both server and client bundles (the NEXT_PUBLIC_ prefix). Falls back to the
 * production hostname so local/dev builds still emit absolute URLs.
 */
import type { Metadata } from "next";

// Single env seam for frontend code: eslint bans `process` elsewhere in
// frontend/** so all NEXT_PUBLIC_SITE_URL reads funnel through this one line.
// eslint-disable-next-line no-restricted-globals
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai").replace(
  /\/+$/,
  "",
);

export const SITE_NAME = "9Th-Grade AI";

/** Build an absolute URL from a root-relative path. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Default share image used by every page (root opengraph-image route). */
export const DEFAULT_SHARE_IMAGE = absoluteUrl("/opengraph-image");

/**
 * Build a complete, consistent Metadata object for a public page:
 * unique title + description, canonical URL, and OG/Twitter share images.
 * Every content page should use this so no two pages share a title or
 * description and every page carries a share image.
 */
export function pageMeta({
  title,
  description,
  path,
  type = "website",
  publishedTime,
  images,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  publishedTime?: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  noIndex?: boolean;
}): Metadata {
  const shareImages = images ?? [
    { url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME} share image` },
  ];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type,
      siteName: SITE_NAME,
      ...(publishedTime ? { publishedTime } : {}),
      images: shareImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: shareImages.map((image) => image.url),
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
