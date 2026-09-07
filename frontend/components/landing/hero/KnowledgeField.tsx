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
  if (q === "low") return { count: 180, connections: 0.22, dpr: 1.2, fps: 30 };
  if (q === "medium") return { count: 480, connections: 0.28, dpr: 1.35, fps: 45 };
  return { count: 900, connections: 0.32, dpr: 1.5, fps: 60 };
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

    const ctx = canvas.getContext("2d", { alpha: true });
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
      if (!pointerEffects || quality === "low" || quality === "static") return;
      const rect = canvas.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.9;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.6;
    };
    const section = canvas.parentElement;
    section?.addEventListener("pointermove", onPointerMove as unknown as EventListener, { passive: true } as AddEventListenerOptions);

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

        mouseX += (targetX - mouseX) * 0.04;
        mouseY += (targetY - mouseY) * 0.04;

        ctx.clearRect(0, 0, w, h);

        // perspective projection
        const cx = w * 0.62 + mouseX * w * 0.03;
        const cy = h * 0.46 + mouseY * h * 0.025;
        const scaleBase = Math.min(w, h) * 0.58;
        const time = now * 0.00022;
        const scrollFade = 1 - scrollProgress * 0.85;
        const scrollScale = 1 - scrollProgress * 0.18;

        // slight global rotation
        const rotY = time * 0.12 + mouseX * 0.18;
        const rotX = time * 0.06 + mouseY * 0.12;

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
          // weak spot pulse every 4.2s: pick cluster index
          const pulseCluster = Math.floor((now / 4200) % CLUSTERS.length);
          const isWeak = i % CLUSTERS.length === pulseCluster && Math.sin(now * 0.0012 + p.ph) > 0.6;
          const pulse = isWeak ? 1.4 : 1;

          // rotate
          let x = p.ox * cosY - p.oz * sinY;
          let z = p.ox * sinY + p.oz * cosY;
          let y = p.oy * cosX - z * sinX;
          z = p.oy * sinX + z * cosX;

          // breathing
          const breathe = 1 + Math.sin(time * 0.9 + p.ph) * 0.015 * pulse;
          x *= breathe;
          y *= breathe;
          z *= breathe;

          // perspective
          const persp = 2.2 / (2.2 + z);
          const px = cx + x * scaleBase * persp * scrollScale;
          const py = cy + y * scaleBase * persp * scrollScale;
          const alpha = Math.max(0, Math.min(1, persp * 0.95 * appear * scrollFade * (isWeak ? 0.95 : 0.72)));
          const size = p.s * persp * dpr * (isDark ? 1 : 0.9) * pulse;

          projected.push({ x: px, y: py, z, alpha, size, col: p.c });
        }

        // draw connections (behind nodes)
        ctx.lineWidth = (isDark ? 0.7 : 0.6) * dpr;
        for (const [a, b] of pairs) {
          if (a >= projected.length || b >= projected.length) continue;
          const pa = projected[a];
          const pb = projected[b];
          if (!pa || !pb) continue;
          const avgZ = (pa.z + pb.z) * 0.5;
          if (avgZ < -0.6) continue;
          const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
          if (dist > w * 0.22) continue;
          // reveal connections after 1.5s
          if (intro < 0.22) continue;
          const reveal = Math.min(1, (intro - 0.22) / 0.28);
          const op = Math.min(pa.alpha, pb.alpha) * 0.18 * reveal * (isDark ? 1 : 0.55) * (avgZ > 0 ? 1 : 0.35);
          if (op < 0.02) continue;
          ctx.strokeStyle = isDark ? `rgba(148,155,195,${op})` : `rgba(100,105,150,${op})`;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          // slight curve
          const mx = (pa.x + pb.x) * 0.5 + (pa.z - pb.z) * 8;
          const my = (pa.y + pb.y) * 0.5;
          ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
          ctx.stroke();

          // traveling pulse every few seconds along a subset
          if (intro > 0.55 && (a + b) % 97 === 0) {
            const t = ((now * 0.00045 + a * 0.13) % 1);
            const px = pa.x + (pb.x - pa.x) * t;
            const py = pa.y + (pb.y - pa.y) * t;
            ctx.fillStyle = `rgba(45,212,191,${0.85 * reveal * scrollFade})`;
            ctx.beginPath();
            ctx.arc(px, py, 1.2 * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // draw nodes
        for (const pr of projected) {
          // highlight active cluster pulse
          const coreDist = Math.hypot(pr.x - cx, pr.y - cy);
          const isCore = coreDist < 18 * dpr && pr.z > 0.2;
          ctx.globalAlpha = pr.alpha * (isCore ? 1 : 1);
          if (isCore) {
            // tiny core glow
            ctx.fillStyle = isDark ? "rgba(45,212,191,0.95)" : "rgba(99,102,241,0.9)";
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, pr.size * 1.6 + 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = pr.col;
          // nodes closer have slight glow
          if (pr.z > 0.3) {
            ctx.shadowColor = pr.col;
            ctx.shadowBlur = 6 * dpr;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, pr.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // central 9G core — appears at 5.5s, subtle
        if (intro > 0.78) {
          const coreReveal = Math.min(1, (intro - 0.78) / 0.14);
          const coreAlpha = coreReveal * 0.16 * scrollFade * (isDark ? 1 : 0.5);
          ctx.fillStyle = isDark ? `rgba(167,139,250,${coreAlpha})` : `rgba(99,102,241,${coreAlpha * 0.7})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 42 * dpr * coreReveal, 0, Math.PI * 2);
          ctx.fill();
          if (intro > 0.86) {
            ctx.fillStyle = isDark ? `rgba(255,255,255,${0.92 * coreReveal * scrollFade})` : `rgba(15,23,42,${0.85 * coreReveal})`;
            ctx.font = `${12 * dpr}px var(--font-display, system-ui)`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("9G", cx, cy);
          }
        }

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
    };
  }, [quality, isDark, pointerEffects]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ display: "block" }} />;
}
