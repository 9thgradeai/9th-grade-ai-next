"use client";

import Button from "@/components/ui/Button";
import AuroraOrb from "@/components/ui/AuroraOrb";
import Breadcrumbs, { type BreadcrumbItem } from "@/components/ui/Breadcrumbs";

export type PageHeroAction = {
  href: string;
  label: string;
  variant?: "primary" | "ghost";
};

export default function PageHero({
  eyebrow,
  title,
  highlight,
  description,
  actions = [],
  breadcrumbs,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description?: string;
  actions?: PageHeroAction[];
  /** Optional explicit trail; defaults to the current pathname. */
  breadcrumbs?: BreadcrumbItem[];
}) {
  return (
    <section className="relative pt-20 pb-14 md:pt-28 md:pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Ambient aurora orbs, same language as the landing hero */}
      <AuroraOrb
        colorClass="bg-emerald-500/10"
        size="34rem"
        blur="120px"
        className="absolute -top-24 left-1/4"
      />
      <AuroraOrb
        colorClass="bg-sky-500/10"
        size="26rem"
        blur="110px"
        duration={14}
        breatheTo={1.1}
        delay={1.2}
        className="absolute -top-16 right-1/5 hidden sm:block"
      />

      <div className="relative max-w-4xl mx-auto text-center">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <p className="page-hero-rise section-eyebrow justify-center mb-4" style={{ animationDelay: "0s" }}>
          <span className="text-emerald-400" aria-hidden="true">{"//"}</span>
          {eyebrow}
        </p>
        <h1
          className="page-hero-rise font-display text-4xl sm:text-5xl md:text-6xl font-semibold text-white leading-[1.05] tracking-tight text-balance break-words"
          style={{ animationDelay: "0.05s" }}
        >
          {title}
          {highlight ? (
            <>
              <br />
              <span className="text-gradient">{highlight}</span>
            </>
          ) : null}
        </h1>
        {description ? (
          <p
            className="page-hero-rise mt-5 text-base sm:text-lg text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed"
            style={{ animationDelay: "0.12s" }}
          >
            {description}
          </p>
        ) : null}
        {actions.length > 0 ? (
          <div
            className="page-hero-rise mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
            style={{ animationDelay: "0.18s" }}
          >
            {actions.map((action) => (
              <Button
                key={action.href}
                href={action.href}
                size="lg"
                variant={action.variant === "ghost" ? "ghost" : "primary"}
                className={
                  action.variant === "ghost"
                    ? "font-mono w-full sm:w-auto"
                    : "glow-border font-mono font-semibold tracking-wide w-full sm:w-auto"
                }
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
