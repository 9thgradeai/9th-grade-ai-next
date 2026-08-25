"use client";

import { useEffect, useRef } from "react";
import { detectDeviceTier } from "@/lib/motion/device";

type FieldNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  phase: number;
  pulseSpeed: number;
};

const PALETTE = [
  [45, 212, 191], // signal teal
  [34, 211, 238], // stellar cyan
  [129, 140, 248], // aurora indigo
  [167, 139, 250], // nebula violet
] as const;

const LINK_DISTANCE = 120;
const POINTER_DISTANCE = 140;

/**
 * Hero "knowledge intelligence field" — a single shared Canvas 2D layer of
 * slowly drifting nodes linked into an abstract neural mesh.
 *
 * Engineering contract:
 *  - one rAF loop, paused whenever the canvas is offscreen or the tab hides
 *  - devicePixelRatio capped (≤1.5, exactly 1 on low-tier devices)
 *  - particle count scales with viewport area AND device tier
 *  - reduced motion / low tier render one static frame instead of a loop
 *  - full cleanup of observers, listeners, and the animation frame
 */
export default function KnowledgeField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tier = detectDeviceTier();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const staticMode = reducedMotion || tier === "low";
    const pointerFine = window.matchMedia("(pointer: fine)").matches && !reducedMotion;

    let width = 0;
    let height = 0;
    let nodes: FieldNode[] = [];
    let raf = 0;
    let inView = true;
    let documentVisible = document.visibilityState === "visible";
    let pointerX = -9999;
    let pointerY = -9999;
    let lastTime = performance.now();
    let resizePending = false;

    const isLightTheme = () => document.documentElement.classList.contains("light");

    const seedNodes = () => {
      const areaBudget = (width * height) / 16000;
      const tierBase = tier === "high" ? 68 : tier === "mid" ? 46 : 22;
      const count = Math.max(10, Math.round(Math.min(tierBase, areaBudget)));
      nodes = Array.from({ length: count }, () => {
        const [r, g, b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        const speed = tier === "high" ? 0.055 : 0.04;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 2 * speed,
          vy: (Math.random() - 0.5) * 2 * speed,
          radius: 0.9 + Math.random() * 1.4,
          color: `${r},${g},${b}`,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.4 + Math.random() * 0.6,
        };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dprCap = tier === "low" ? 1 : 1.5;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedNodes();
      if (staticMode) drawFrame(0);
    };

    const drawFrame = (time: number) => {
      const light = isLightTheme();
      const themeAlpha = light ? 0.55 : 1;
      ctx.clearRect(0, 0, width, height);

      // Connections first so dots sit on top.
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DISTANCE * LINK_DISTANCE) continue;
          const strength = 1 - Math.sqrt(d2) / LINK_DISTANCE;
          ctx.strokeStyle = `rgba(129,140,248,${(0.13 * strength * themeAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Faint threads toward the cursor (fine pointers only).
      if (pointerFine && pointerX >= 0) {
        for (const node of nodes) {
          const dx = node.x - pointerX;
          const dy = node.y - pointerY;
          const d2 = dx * dx + dy * dy;
          if (d2 > POINTER_DISTANCE * POINTER_DISTANCE) continue;
          const strength = 1 - Math.sqrt(d2) / POINTER_DISTANCE;
          ctx.strokeStyle = `rgba(45,212,191,${(0.16 * strength * themeAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(pointerX, pointerY);
          ctx.lineTo(node.x, node.y);
          ctx.stroke();
        }
      }

      for (const node of nodes) {
        const pulse = reducedMotion
          ? 0.7
          : 0.55 + 0.45 * Math.sin(time * 0.001 * node.pulseSpeed + node.phase);
        ctx.fillStyle = `rgba(${node.color},${(pulse * themeAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!staticMode && pointerFine && pointerX >= 0) {
        ctx.fillStyle = `rgba(45,212,191,${(0.8 * themeAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (now: number) => {
      if (!running()) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      const k = dt / 16.7;

      for (const node of nodes) {
        node.x += node.vx * k;
        node.y += node.vy * k;
        if (node.x < -8) node.x = width + 8;
        else if (node.x > width + 8) node.x = -8;
        if (node.y < -8) node.y = height + 8;
        else if (node.y > height + 8) node.y = -8;

        // Gentle cursor gravity — barely perceptible drift.
        if (pointerFine && pointerX >= 0) {
          const dx = pointerX - node.x;
          const dy = pointerY - node.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 40 && dist < POINTER_DISTANCE) {
            node.x += (dx / dist) * 0.08 * k;
            node.y += (dy / dist) * 0.08 * k;
          }
        }
      }

      drawFrame(now);
      raf = requestAnimationFrame(step);
    };

    const running = () => inView && documentVisible && !staticMode;

    const startLoop = () => {
      cancelAnimationFrame(raf);
      if (running()) {
        lastTime = performance.now();
        raf = requestAnimationFrame(step);
      }
    };

    resize();

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        startLoop();
      },
      { rootMargin: "80px" },
    );
    intersectionObserver.observe(canvas);

    const onVisibilityChange = () => {
      documentVisible = document.visibilityState === "visible";
      startLoop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const resizeObserver = new ResizeObserver(() => {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(() => {
        resizePending = false;
        resize();
      });
    });
    resizeObserver.observe(canvas);

    let themeObserver: MutationObserver | null = null;
    if (staticMode) {
      // Redraw the frozen frame when the theme flips so contrast stays right.
      themeObserver = new MutationObserver(() => drawFrame(performance.now()));
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
    };
    const onPointerLeave = () => {
      pointerX = -9999;
      pointerY = -9999;
    };
    if (pointerFine) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      themeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
