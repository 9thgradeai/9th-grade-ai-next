"use client";

import { useEffect, useRef } from "react";
import { useMotionCapabilities } from "@/lib/motion/device";

// Lightweight canvas knowledge field — no Three.js, no DOM particles.
// All math is GPU-friendly: single canvas, instanced draws, reused buffers.
type Quality = "high" | "medium" | "low" | "static";

const SUBJECT_COLORS: Record<string, string> = {
  Bangla: "#2dd4bf",
  English: "#38bdf8",
  Math: "#a78bfa",
  ICT: "#f472b6",
  GK: "#fbbf24",
  Science: "#34d399",
  Geography: "#60a5fa",
};

const CLUSTERS = [
  { id: "Bangla", theta: 0.2, phi: 1.1 },
  { id: "English", theta: 0.9, phi: 1.3 },
  { id: "Math", theta: 1.6, phi: 1.0 },
  { id: "ICT", theta: 2.4, phi: 1.4 },
  { id: "GK", theta: 3.1, phi: 1.1 },
  { id: "Science", theta: 4.2, phi: 0.9 },
  { id: "Geography", theta: 5.1, phi: 1.2 },
  { id: "Bangladesh", theta: 5.7, phi: 1.5 },
  { id: "Mental", theta: 1.1, phi: 0.6 },
  { id: "Current", theta: 3.8, phi: 1.6 },
];

function qualityConfig(q: Quality, isDark: boolean) {
  if (q === "static") return { count: 0, connections: 0, dpr: 1, fps: 0 };
  if (q === "low") return { count: 180, connections: 0.22, dpr: 1.15, fps: 30 };
  if (q === "medium") return { count: 480, connections: 0.28, dpr: 1.3, fps: 60 };
  // high: 120fps on capable displays — DPR capped for 120hz performance
  return { count: 900, connections: 0.32, dpr: 1.4, fps: 120 };
}

export default function KnowledgeField({
  quality,
  isDark = true,
}: {
  quality: Quality;
  isDark?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { pointerEffects } = useMotionCapabilities();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cfg = qualityConfig(quality, isDark);
    if (cfg.count === 0) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true, willReadFrequently: false } as unknown as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    let w = 0,
      h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
    let raf = 0;
    let running = true;
    let mouseX = 0,
      mouseY = 0,
      targetX = 0,
      targetY = 0;
    let scrollProgress = 0;
    let intro = 0; // 0→1 over 6.5s
    const start = performance.now();

    // reused buffers
    const particles: { x: number; y: number; z: number; ox: number; oy: number; oz: number; c: string; s: number; ph: number }[] = [];
    const R = 1.15;
    for (let i = 0; i < cfg.count; i++) {
      const cluster = CLUSTERS[i % CLUSTERS.length];
      // spherical jitter around cluster center
      const theta = cluster.theta + (Math.random() - 0.5) * 0.9;
      const phi = cluster.phi + (Math.random() - 0.5) * 0.7;
      const r = R * (0.55 + Math.random() * 0.45);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      const col = SUBJECT_COLORS[cluster.id] || "#a78bfa";
      particles.push({ x, y, z, ox: x, oy: y, oz: z, c: col, s: 0.7 + Math.random() * 1.1, ph: Math.random() * Math.PI * 2 });
    }

    // connections: precompute pairs within threshold in spherical space (sparse)
    const pairs: [number, number][] = [];
    for (let i = 0; i < particles.length; i += 3) {
      for (let j = i + 1; j < Math.min(particles.length, i + 18); j += 2) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dz = particles[i].z - particles[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.42) pairs.push([i, j]);
        if (pairs.length > 1400) break;
      }
      if (pairs.length > 1400) break;
    }

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      w = Math.round(rect.width * dpr);
      h = Math.round(rect.height * dpr);
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const onPointerMove = (e: PointerEvent) => {
      if (quality === "static") return;
      // allow pointer on all, but reduce intensity on touch/low
      const isTouch = (e as unknown as { pointerType?: string }).pointerType === "touch";
      const intensity = isTouch || quality === "low" ? 0.45 : 0.9;
      const rect = canvas.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * intensity;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * (intensity * 0.66);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (quality === "static") return;
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      targetX = ((t.clientX - rect.left) / rect.width - 0.5) * 0.55;
      targetY = ((t.clientY - rect.top) / rect.height - 0.5) * 0.38;
    };
    const section = canvas.parentElement;
    section?.addEventListener("pointermove", onPointerMove as unknown as EventListener, { passive: true } as AddEventListenerOptions);
    section?.addEventListener("touchmove", onTouchMove as unknown as EventListener, { passive: true } as AddEventListenerOptions);

    const onScroll = () => {
      const rect = section?.getBoundingClientRect();
      if (!rect) return;
      // 0 = hero fully visible, 1 = scrolled past
      const p = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.9)));
      scrollProgress = p;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // visibility pause
    const io = new IntersectionObserver(
      (entries) => {
        running = entries[0]?.isIntersecting ?? true;
        if (running && !raf) loop();
      },
      { threshold: 0 }
    );
    if (section) io.observe(section);
    const onVis = () => {
      if (document.visibilityState === "hidden") running = false;
      else {
        running = true;
        if (!raf) loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    const fpsInterval = 1000 / cfg.fps;
    let accum = 0;

    const loop = () => {
      raf = requestAnimationFrame((now) => {
        if (!running) {
          raf = 0;
          return;
        }
        const dt = Math.min(32, now - last);
        last = now;
        accum += dt;
        if (accum < fpsInterval) {
          loop();
          return;
        }
        accum = 0;

        intro = Math.min(1, (now - start) / 6500);
        // ease intro
        const easedIntro = 1 - Math.pow(1 - intro, 3);

        mouseX += (targetX - mouseX) * 0.065;
        mouseY += (targetY - mouseY) * 0.065;

        ctx.clearRect(0, 0, w, h);

        // scroll-driven intelligence state: discover → master
        // 0-0.2 discover (loose), 0.2-0.4 analyze, 0.4-0.6 practice, 0.6-0.8 improve, 0.8-1 master (ordered)
        const sp = scrollProgress;
        let stateIntensity = 0.92;
        let connBoost = 1;
        let pulseBoost = 1;
        if (sp < 0.2) {
          stateIntensity = 0.78 + sp * 0.7; // 0.78→0.92
          connBoost = 0.72;
          pulseBoost = 0.7;
        } else if (sp < 0.4) {
          stateIntensity = 0.92 + (sp - 0.2) * 0.6;
          connBoost = 1.05;
          pulseBoost = 0.95;
        } else if (sp < 0.6) {
          stateIntensity = 1.04 + (sp - 0.4) * 0.8; // practice — peak activity
          connBoost = 1.18;
          pulseBoost = 1.25;
        } else if (sp < 0.8) {
          stateIntensity = 1.2 - (sp - 0.6) * 0.5; // improve — reorganize brighten
          connBoost = 1.08;
          pulseBoost = 1.1;
        } else {
          stateIntensity = 1.1 - (sp - 0.8) * 0.75; // master — stable ordered
          connBoost = 0.92;
          pulseBoost = 0.85;
        }

        // responsive viewing angle — fully centered on mobile, offset right on desktop
        const isMobileView = w < 640 * dpr;
        const isTabletView = w < 1024 * dpr;
        const isWideView = w > 1440 * dpr;
        const baseCx = isMobileView ? 0.5 : isTabletView ? 0.56 : isWideView ? 0.66 : 0.62;
        const baseCy = isMobileView ? 0.42 : 0.48;
        const baseScale = isMobileView ? 0.52 : isTabletView ? 0.55 : isWideView ? 0.62 : 0.58;
        const parallaxStrength = isMobileView ? 0.018 : 0.034;
        const cx = w * baseCx + mouseX * w * parallaxStrength;
        const cy = h * baseCy + mouseY * h * (parallaxStrength * 0.8);
        const scaleBase = Math.min(w, h) * baseScale * stateIntensity;
        const time = now * 0.00034;
        const scrollFade = 1 - scrollProgress * 0.85;
        const scrollScale = 1 - scrollProgress * 0.18;

        // slightly faster global rotation — still calm, more alive, scroll modulates speed
        const rotY = time * (0.18 + sp * 0.06) + mouseX * 0.22;
        const rotX = time * (0.09 + sp * 0.04) + mouseY * 0.15;

        // project particles
        const projected: { x: number; y: number; z: number; alpha: number; size: number; col: string }[] = [];
        const cosY = Math.cos(rotY),
          sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX),
          sinX = Math.sin(rotX);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          // subtle organic drift + intro reveal (particles spawn outward)
          const appear = Math.min(1, easedIntro * 1.6 - i * 0.0009);
          if (appear <= 0) continue;
          // weak spot — reorganize: dim → pulse → jitter → brighten
          const weakPeriod = 3200;
          const weakPhase = (now % weakPeriod) / weakPeriod; // 0→1
          const pulseCluster = Math.floor((now / weakPeriod) % CLUSTERS.length);
          const inWeakCluster = i % CLUSTERS.length === pulseCluster;
          // jitter during 0.05-0.35 of period, brighten 0.35-0.65
          const isJittering = inWeakCluster && weakPhase > 0.05 && weakPhase < 0.32;
          const isBrightening = inWeakCluster && weakPhase >= 0.32 && weakPhase < 0.62;
          const isWeak = inWeakCluster && Math.sin(now * 0.0018 + p.ph) > 0.6;
          const pulse = isBrightening ? 1.55 : isWeak ? 1.45 : 1;

          // rotate
          let x = p.ox * cosY - p.oz * sinY;
          let z = p.ox * sinY + p.oz * cosY;
          let y = p.oy * cosX - z * sinX;
          z = p.oy * sinX + z * cosX;

          // weak-spot reorganize jitter
          if (isJittering) {
            const j = (weakPhase - 0.05) / 0.27; // 0→1
            const jitterAmp = Math.sin(j * Math.PI) * 0.045 * (1 - Math.abs(p.ox) * 0.3);
            x += Math.sin(now * 0.008 + p.ph * 1.7) * jitterAmp;
            y += Math.cos(now * 0.007 + p.ph * 1.3) * jitterAmp;
            z += Math.sin(now * 0.006 + p.ph) * jitterAmp * 0.6;
          }

          // faster breathing
          const breathe = 1 + Math.sin(time * 1.32 + p.ph) * 0.016 * pulse;
          x *= breathe;
          y *= breathe;
          z *= breathe;

          // perspective
          const persp = 2.2 / (2.2 + z);
          const px = cx + x * scaleBase * persp * scrollScale;
          const py = cy + y * scaleBase * persp * scrollScale;
          let alpha = Math.max(0, Math.min(1, persp * 0.95 * appear * scrollFade * (isBrightening ? 1 : isWeak ? 0.95 : 0.72)));
          // brightening phase boosts alpha
          if (isBrightening) alpha = Math.min(1, alpha * 1.28);
          // scroll state modulates alpha slightly
          alpha *= 0.92 + stateIntensity * 0.08;
          const size = p.s * persp * dpr * (isDark ? 1 : 0.9) * pulse * (0.92 + stateIntensity * 0.08);

          projected.push({ x: px, y: py, z, alpha, size, col: p.c });
        }

        // draw connections (behind nodes) — scroll state boosts density/opacity
        ctx.lineWidth = (isDark ? 0.7 : 0.6) * dpr;
        for (const [a, b] of pairs) {
          if (a >= projected.length || b >= projected.length) continue;
          const pa = projected[a];
          const pb = projected[b];
          if (!pa || !pb) continue;
          const avgZ = (pa.z + pb.z) * 0.5;
          if (avgZ < -0.6) continue;
          const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
          if (dist > w * (0.22 + (stateIntensity - 1) * 0.04)) continue;
          // reveal connections after 1.5s, scroll state controls density
          if (intro < 0.22) continue;
          const reveal = Math.min(1, (intro - 0.22) / 0.28) * (0.82 + connBoost * 0.18);
          const op = Math.min(pa.alpha, pb.alpha) * 0.18 * reveal * connBoost * (isDark ? 1 : 0.55) * (avgZ > 0 ? 1 : 0.35);
          if (op < 0.02) continue;
          ctx.strokeStyle = isDark ? `rgba(148,155,195,${op})` : `rgba(100,105,150,${op})`;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          // slight curve — scroll state tightens/loosens
          const mx = (pa.x + pb.x) * 0.5 + (pa.z - pb.z) * (8 + (stateIntensity - 1) * 4);
          const my = (pa.y + pb.y) * 0.5;
          ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
          ctx.stroke();

          // traveling pulse — scroll state speeds it
          if (intro > 0.55 && (a + b) % 97 === 0) {
            const t = ((now * (0.00068 * pulseBoost) + a * 0.13) % 1);
            const px = pa.x + (pb.x - pa.x) * t;
            const py = pa.y + (pb.y - pa.y) * t;
            ctx.fillStyle = `rgba(45,212,191,${0.85 * reveal * scrollFade * pulseBoost})`;
            ctx.beginPath();
            ctx.arc(px, py, 1.2 * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // draw nodes — depth-of-field: far nodes desaturated + no glow, near nodes crisp + glow
        for (const pr of projected) {
          let col = pr.col;
          // desaturate far depth for true DOF
          if (pr.z < -0.18) {
            const r = parseInt(col.slice(1, 3), 16);
            const g = parseInt(col.slice(3, 5), 16);
            const b = parseInt(col.slice(5, 7), 16);
            const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
            const mix = pr.z < -0.48 ? 0.58 : 0.38;
            const nr = Math.round(r * (1 - mix) + gray * mix);
            const ng = Math.round(g * (1 - mix) + gray * mix);
            const nb = Math.round(b * (1 - mix) + gray * mix);
            col = `rgb(${nr},${ng},${nb})`;
          }
          ctx.globalAlpha = pr.alpha * (pr.z < -0.35 ? 0.72 : 1);
          ctx.fillStyle = col;
          // only near nodes glow — far stay matte for depth
          if (pr.z > 0.32) {
            ctx.shadowColor = col;
            ctx.shadowBlur = (isMobileView ? 4 : 7) * dpr;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, pr.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        loop();
      });
    };
    loop();

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
      section?.removeEventListener("pointermove", onPointerMove as unknown as EventListener);
      section?.removeEventListener("touchmove", onTouchMove as unknown as EventListener);
    };
  }, [quality, isDark, pointerEffects]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ display: "block" }} />;
}
