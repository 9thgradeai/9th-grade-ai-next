"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMotionCapabilities } from "@/lib/motion/device";

const KnowledgeField = dynamic(() => import("./KnowledgeField"), { ssr: false });

type Quality = "high" | "medium" | "low" | "static";

function pickQuality(): Quality {
  if (typeof window === "undefined") return "medium";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  const tierStr = (() => {
    try {
      const c = (navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number }).deviceMemory ?? 4;
      const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
      if (c <= 2 || cores <= 2) return "low";
      if (window.innerWidth < 768) return "low";
      if (window.innerWidth < 1024) return "medium";
      return "high";
    } catch {
      return "medium";
    }
  })();
  if (tierStr === "low") return "low";
  if (tierStr === "medium") return "medium";
  return "high";
}

export default function HeroVisual() {
  const [quality, setQuality] = useState<Quality>("medium");
  const [isDark, setIsDark] = useState(true);
  const { continuousEffects } = useMotionCapabilities();

  useEffect(() => {
    queueMicrotask(() => setQuality(pickQuality()));
    // theme detection: dashboard theme vs root dark
    const checkTheme = () => {
      const isLight = document.documentElement.classList.contains("light") || document.querySelector('[data-dashboard-theme="light"]');
      // hero is always dark per design, but respect html.light
      queueMicrotask(() => setIsDark(!document.documentElement.classList.contains("light") && !isLight));
    };
    queueMicrotask(checkTheme);
    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const effectiveQuality: Quality = !continuousEffects ? "static" : quality;

  if (effectiveQuality === "static") {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_62%_38%,rgba(45,212,191,0.10),transparent_60%),radial-gradient(ellipse_50%_40%_at_85%_75%,rgba(167,139,250,0.08),transparent_55%)]" />
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[0.22]" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="rgba(148,155,195,0.28)" strokeWidth="0.7">
            <circle cx="520" cy="220" r="92" strokeDasharray="4 8" />
            <circle cx="520" cy="220" r="132" strokeDasharray="2 10" opacity="0.6" />
            <circle cx="520" cy="220" r="172" strokeDasharray="3 12" opacity="0.35" />
          </g>
          <g fill="rgba(45,212,191,0.9)">
            <circle cx="520" cy="220" r="3" />
            <circle cx="600" cy="180" r="2" />
            <circle cx="460" cy="260" r="2.2" />
            <circle cx="560" cy="300" r="1.8" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <KnowledgeField quality={effectiveQuality} isDark={isDark} />
      {/* contrast wash to keep hero text dominant — right/back plane */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_62%_38%,transparent_32%,rgba(5,5,9,0.42)_72%)]" />
      <div className="absolute inset-0 hidden sm:block bg-[linear-gradient(100deg,rgba(5,5,9,0.88)_0%,rgba(5,5,9,0.45)_28%,transparent_62%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,5,9,0.55)_0%,transparent_42%)] sm:hidden" />
    </div>
  );
}
