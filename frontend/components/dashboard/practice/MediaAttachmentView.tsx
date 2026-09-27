"use client";

import type { Server } from "@/lib/types";

/**
 * Figure/diagram attachment wrapper. Renders `media[]` (URLs only — files
 * live in `public/`) above the choice UI. Math stays unicode-linearized text
 * through RichText (no KaTeX); unknown kinds are ignored, never crash.
 */
export default function MediaAttachmentView({
  media,
  children,
}: {
  media: Server.QuestionDTO["media"];
  children: React.ReactNode;
}) {
  const images = (media ?? []).filter((m) => m?.kind === "image" && typeof m.url === "string" && m.url.length > 0);
  return (
    <div className="space-y-4">
      {images.map((m, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={m.url}
          alt={m.alt ?? `Figure ${i + 1}`}
          className="rounded-xl border border-terminal-border max-w-full h-auto mx-auto"
          loading="lazy"
        />
      ))}
      {children}
    </div>
  );
}
