"use client";

import Reveal from "./Reveal";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  highlight: string;
  description?: string;
  align?: "center" | "left";
  showEyebrow?: boolean;
}

/**
 * Section heading with eyebrow restraint per taste-skill §4.7:
 * max 1 eyebrow per 3 sections. Use `showEyebrow={false}` for sections
 * where the headline alone suffices. Hero counts as 1 section.
 */
export default function SectionHeading({
  eyebrow,
  title,
  highlight,
  description,
  align = "center",
  showEyebrow = true,
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <Reveal className={`mb-14 md:mb-16 ${centered ? "text-center" : ""}`}>
      {showEyebrow && eyebrow ? (
        <p className={`section-eyebrow ${centered ? "justify-center" : ""}`}>
          <span className="text-[var(--dashboard-primary)]" aria-hidden="true">{"//"}</span>
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-display mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold text-white leading-tight tracking-tight">
        {title}
        <br />
        <span className="text-gradient">{highlight}</span>
      </h2>
      {description ? (
        <p
          className={`mt-4 text-base sm:text-lg text-[var(--text-muted)] max-w-2xl ${
            centered ? "mx-auto" : ""
          } leading-relaxed`}
        >
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
