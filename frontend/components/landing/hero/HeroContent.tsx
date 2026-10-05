"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, CaretDown } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { trackCtaClick, trackHeroView } from "@/lib/analytics";
import { useMotionCapabilities } from "@/lib/motion/device";
import { useT } from "@/lib/i18n";

/** Lightweight word-reveal that mirrors the previous Framer Motion entrance
 *  but runs as a pure CSS animation, so the heading is visible at first paint
 *  (no waiting on JS hydration) — critical for mobile LCP. */
function WordReveal({
  text,
  className = "",
  wordClassName,
  delay = 0,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-bottom"
        >
          <span
            className={`word-rise inline-block will-change-transform${
              wordClassName ? ` ${wordClassName}` : ""
            }`}
            style={{ animationDelay: `${delay + i * 0.05}s` }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

const stats = (subjectCount: number) => [
  { value: String(subjectCount), label: "subjects" },
  { value: "2", label: "languages" },
  { value: "100%", label: "free" },
];

export default function HeroContent({ subjectCount }: { subjectCount: number }) {
  const t = useT();
  const copyRef = useRef<HTMLDivElement>(null);
  const { pointerEffects } = useMotionCapabilities();

  useEffect(() => {
    const start = Date.now();
    return () => trackHeroView(Date.now() - start);
  }, []);

  // Vanilla pointer parallax on the copy layer — no animation library needed.
  useEffect(() => {
    if (!pointerEffects) return;
    const section = document.querySelector(".hero-section-ref");
    const copy = copyRef.current;
    if (!section || !copy) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    const onMove = (e: globalThis.PointerEvent) => {
      const rect = section.getBoundingClientRect();
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * -6;
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * -5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const apply = () => {
      raf = 0;
      copy.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    section.addEventListener("pointermove", onMove as (e: Event) => void, { passive: true });
    section.addEventListener("pointerleave", onLeave as (e: Event) => void);
    return () => {
      section.removeEventListener("pointermove", onMove as (e: Event) => void);
      section.removeEventListener("pointerleave", onLeave as (e: Event) => void);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pointerEffects]);

  // Lightweight magnetic pull on the primary CTA — vanilla, no animation lib.
  useEffect(() => {
    if (!pointerEffects) return;
    const el = document.querySelector<HTMLElement>(".hero-magnetic-cta");
    if (!el) return;
    let raf = 0;
    let mx = 0;
    let my = 0;
    const apply = () => {
      raf = 0;
      el.style.transform = `translate(${mx}px, ${my}px)`;
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 14;
      my = ((e.clientY - r.top) / r.height - 0.5) * 14;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      mx = 0;
      my = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    el.addEventListener("pointermove", onMove as (e: Event) => void, { passive: true });
    el.addEventListener("pointerleave", onLeave as (e: Event) => void);
    return () => {
      el.removeEventListener("pointermove", onMove as (e: Event) => void);
      el.removeEventListener("pointerleave", onLeave as (e: Event) => void);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pointerEffects]);

  const statItems = stats(subjectCount);

  return (
    <div ref={copyRef} className="hero-copy relative z-10 mx-auto w-full max-w-7xl">
      <div className="max-w-3xl">
        {/* Reskin: eyebrow is now a glass status pill with a live pulse — the
            first thing the eye lands on, not a bare mono label. */}
        <p className="hero-eyebrow mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.06] py-2 pl-3 pr-4 text-[13px] font-medium text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[#A9B8FF]" aria-hidden="true">
            <defs>
              <linearGradient id="hero-ai-cap" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="60%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            {/* mortarboard — study / exam prep for job aspirants */}
            <path d="M12 3 21 7.5 12 12 3 7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M6 8.6c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            {/* tassel */}
            <path d="M12 7.5 16.4 10.9" stroke="url(#hero-ai-cap)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16.8" cy="11.4" r="1.1" fill="url(#hero-ai-cap)" />
            {/* AI core: orbital node riding the cap */}
            <ellipse cx="12" cy="7.4" rx="3.4" ry="1.3" stroke="url(#hero-ai-cap)" strokeWidth="1.4" transform="rotate(-18 12 7.4)" />
            <circle cx="15.1" cy="6.3" r="1.1" fill="url(#hero-ai-cap)" />
          </svg>
          {t("hero.eyebrow")}
        </p>

        {/* Reskin: billboard-scale Bricolage display — solid ice-white claim
            over an electric gradient payoff. Sized to dominate the viewport
            and carry the product vision at a glance. */}
        <h1 id="hero-heading" className="mb-7 font-hero text-[clamp(2.6rem,10vw,8rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-white text-balance">
          <WordReveal text={t("hero.title1")} className="hero-title" />
          <br />
          <span className="relative inline-block pb-[0.08em]">
            <WordReveal text={t("hero.title2")} className="hero-title" wordClassName="text-gradient" delay={0.15} />
            <svg aria-hidden="true" viewBox="0 0 300 14" preserveAspectRatio="none" className="pen-draw absolute -bottom-[0.02em] left-0 h-[0.12em] w-full overflow-visible">
              <defs>
                <linearGradient id="pen-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="60%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <path d="M 4 10 C 80 5, 190 12, 296 6" fill="none" stroke="url(#pen-stroke)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <svg aria-hidden="true" viewBox="0 0 16 16" className="pen-check absolute -right-[0.32em] top-[0.42em] h-[0.3em] w-[0.3em]">
                <path className="pen-check-path" d="M 3 8.5 L 6.5 12 L 13 4" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </svg>
          </span>
        </h1>

        <p className="hero-sub mb-10 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl">
          {t("hero.subtitle")}
        </p>

        <div className="hero-cta flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <span className="magnetic inline-block w-full sm:w-auto hero-magnetic-cta" data-magnetic>
            <Button
              href="/login?register=true"
              size="lg"
              className="glow-border w-full font-semibold shadow-[0_8px_40px_rgba(139,156,255,0.35)] sm:w-auto"
              onClick={() => trackCtaClick("primary")}
            >
              {t("hero.cta.primary")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </span>
          <Button href="#signal" size="lg" variant="hero" className="w-full sm:w-auto" onClick={() => trackCtaClick("secondary")}>
            {t("hero.cta.secondary")}
            <CaretDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Reskin: stats graduate from a bare row to a glass proof-strip —
            one surface, hairline dividers, tabular numerals. */}
        <dl className="hero-stats mt-12 flex max-w-2xl flex-wrap items-stretch gap-y-4 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-4 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:gap-y-0">
          {statItems.map((stat, i) => (
            <div key={stat.label} className={`flex flex-1 flex-col justify-center gap-1 px-5 sm:px-7 ${i > 0 ? "border-l border-white/10" : ""}`}>
              <dt className="sr-only">{t(`hero.stats.${stat.label}`)}</dt>
              <dd className="font-display text-2xl font-bold text-white tabular-nums sm:text-[1.7rem]">
                {stat.value}
              </dd>
              <dd className="text-[13px] font-normal text-white/55">{t(`hero.stats.${stat.label}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}