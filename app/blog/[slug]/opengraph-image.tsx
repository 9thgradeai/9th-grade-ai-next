// app/blog/[slug]/opengraph-image.tsx
// Dynamic OG image generation for blog articles using Next.js ImageResponse

import { ImageResponse } from "next/og";
import { BLOG_POSTS } from "@/lib/data/blog";

export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "9Th-Grade AI Blog";

export default async function generateOGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  const title = post?.title ?? "9Th-Grade AI";
  const tag = post?.tag ?? "BLOG";

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0f172a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #10b981, #06b6d4, #8b5cf6)",
          }}
        />

        {/* Tag pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <span
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#10b981",
              padding: "6px 16px",
              borderRadius: "9999px",
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {tag}
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            color: "#ffffff",
            fontSize: post && title.length > 50 ? "40px" : "52px",
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            maxWidth: "900px",
          }}
        >
          {title}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            left: "80px",
            right: "80px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "16px",
              fontWeight: 500,
            }}
          >
            9Th-Grade AI
          </span>
          <span
            style={{
              color: "rgba(16, 185, 129, 0.7)",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            9thgrade.ai/blog
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
