"use client";

import Reveal from "./Reveal";

export default function SectionHeading({
  eyebrow,
  title,
  highlight,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  highlight: string;
  description?: string;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <Reveal className={`mb-14 md:mb-16 ${centered ? "text-center" : ""}`}>
      <p className={`section-eyebrow ${centered ? "justify-center" : ""}`}>
        <span className="text-emerald-400" aria-hidden="true">{"//"}</span>
        {eyebrow}
      </p>
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