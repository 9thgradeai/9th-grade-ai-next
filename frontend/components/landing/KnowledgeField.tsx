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
  // Diagnostic-sweep state: the one-time entrance choreography that aligns
  // nodes onto the ascending "path to passing", then releases them back
  // into free drift. See DIAG below.
  tx: number; // path target
  ty: number;
  fromX: number; // position when claimed
  fromY: number;
  claimAt: number | null;
  freeX: number; // free-drift position after release
  freeY: number;
  released: boolean;
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
 * One-time entrance choreography ("the diagnostic sweep") — the hero tells
 * the product story in ~2.5s: scattered noise (unprepared) → a single radar
 * beam passes (the AI diagnoses) → nodes snap onto an ascending trajectory
 * (your path to passing) → everything relaxes into calm drift.
 *
 *   0–400     chaos drift (normal behaviour)
 *   400–1500  radar beam sweeps L→R; nodes it touches claim a path target
 *   1500–2600 aligned hold — the path breathes in place
 *   2600–4600 release — nodes blend back into free drift
 *
 * Reduced motion / low tier skip the sequence entirely and render the
 * aligned constellation as a static frame.
 */
const SWEEP_START = 400;
const SWEEP_END = 1500;
const HOLD_END = 2600;
const RELEASE_END = 4600;
const CLAIM_DURATION = 700;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Ascending S-curve the nodes align to — the product's "improvement trend" motif. */
function pathTarget(t: number, w: number, h: number): { x: number; y: number } {
  // Cubic bezier P0(0.06,0.80) P1(0.38,0.72) P2(0.62,0.34) P3(0.94,0.22)
  const u = 1 - t;
  const x =
    u * u * u * 0.06 + 3 * u * u * t * 0.38 + 3 * u * t * t * 0.62 + t * t * t * 0.94;
  const y =
    u * u * u * 0.8 + 3 * u * u * t * 0.72 + 3 * u * t * t * 0.34 + t * t * t * 0.22;
  return { x: x * w, y: y * h };
}

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
    // Wall-clock anchor for the sweep timeline (ms since first frame).
    let sequenceStart = -1;

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
          tx: 0,
          ty: 0,
          fromX: 0,
          fromY: 0,
          claimAt: null,
          freeX: 0,
          freeY: 0,
          released: false,
        };
      });

      // Assign ascending path targets left-to-right so the beam reveals the
      // trajectory in reading order. Static mode renders the aligned
      // constellation directly — the "after" composition without motion.
      const order = nodes
        .map((n, i) => i)
        .sort((a, b) => nodes[a].x - nodes[b].x);
      order.forEach((idx, rank) => {
        const t = nodes.length > 1 ? rank / (nodes.length - 1) : 0.5;
        const target = pathTarget(t, width, height);
        const node = nodes[idx];
        node.tx = target.x + (Math.random() - 0.5) * 14;
        node.ty = target.y + (Math.random() - 0.5) * 14;
        if (staticMode) {
          node.x = node.tx;
          node.y = node.ty;
        }
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
      // A mid-session resize skips the entrance replay — land in calm drift.
      if (!staticMode && sequenceStart >= 0) {
        sequenceStart = performance.now() - RELEASE_END - 1;
      }
      if (staticMode) drawFrame(0);
    };

    const drawFrame = (time: number) => {
      const light = isLightTheme();
      const themeAlpha = light ? 0.55 : 1;
      ctx.clearRect(0, 0, width, height);

      // Radar beam — a soft trailing band with a bright leading edge.
      if (!staticMode && activeBeamX >= 0) {
        const band = ctx.createLinearGradient(activeBeamX - 90, 0, activeBeamX, 0);
        band.addColorStop(0, "rgba(45,212,191,0)");
        band.addColorStop(0.75, `rgba(45,212,191,${(0.08 * themeAlpha).toFixed(3)})`);
        band.addColorStop(1, `rgba(45,212,191,${(0.2 * themeAlpha).toFixed(3)})`);
        ctx.fillStyle = band;
        ctx.fillRect(activeBeamX - 90, 0, 90, height);
        ctx.fillStyle = `rgba(45,212,191,${(0.32 * themeAlpha).toFixed(3)})`;
        ctx.fillRect(activeBeamX - 1, 0, 1.5, height);
      }

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
          // Aligned neighbours glow teal — the revealed path reads as one system.
          const aligned = a.claimAt !== null && b.claimAt !== null;
          ctx.strokeStyle = aligned
            ? `rgba(45,212,191,${(0.2 * strength * themeAlpha).toFixed(3)})`
            : `rgba(129,140,248,${(0.13 * strength * themeAlpha).toFixed(3)})`;
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
        // Claimed nodes flare briefly, then settle at full brightness.
        let boost = 1;
        if (node.claimAt !== null) {
          const cT = time - node.claimAt;
          if (cT < CLAIM_DURATION) boost = 1 + 0.9 * (1 - easeOutExpo(cT / CLAIM_DURATION));
        }
        ctx.fillStyle = `rgba(${node.color},${Math.min(1, pulse * boost * themeAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * boost, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!staticMode && pointerFine && pointerX >= 0) {
        ctx.fillStyle = `rgba(45,212,191,${(0.8 * themeAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let activeBeamX = -1;

    const step = (now: number) => {
      if (!running()) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      const k = dt / 16.7;

      if (sequenceStart < 0) sequenceStart = now;
      const seqT = now - sequenceStart;

      // Radar beam position + claiming: nodes the beam has passed snap onto
      // their assigned path target.
      activeBeamX = -1;
      if (seqT >= SWEEP_START && seqT <= SWEEP_END) {
        const p = easeInOut((seqT - SWEEP_START) / (SWEEP_END - SWEEP_START));
        activeBeamX = -90 + (width + 180) * p;
        for (const node of nodes) {
          if (node.claimAt === null && node.x <= activeBeamX) {
            node.claimAt = now;
            node.fromX = node.x;
            node.fromY = node.y;
          }
        }
      }

      for (const node of nodes) {
        if (node.claimAt !== null && !node.released) {
          // Choreographed: claim lerp → aligned hold with a quiet breath.
          const cT = now - node.claimAt;
          if (cT < CLAIM_DURATION) {
            const p = easeOutExpo(cT / CLAIM_DURATION);
            node.x = node.fromX + (node.tx - node.fromX) * p;
            node.y = node.fromY + (node.ty - node.fromY) * p;
          } else if (seqT < HOLD_END) {
            node.x = node.tx;
            node.y = node.ty + Math.sin(now * 0.001 * 0.9 + node.phase) * 1.6;
          } else {
            // Release: seed free drift from the aligned position and blend out.
            node.released = true;
            node.freeX = node.tx;
            node.freeY = node.ty;
          }
          if (!node.released) continue;
        }

        if (node.released && node.claimAt !== null) {
          // Blend the aligned position into free drift, then hand control back
          // to normal integration.
          const blend = easeInOut(
            Math.min(1, (seqT - HOLD_END) / (RELEASE_END - HOLD_END)),
          );
          node.freeX += node.vx * k;
          node.freeY += node.vy * k;
          if (node.freeX < -8) node.freeX = width + 8;
          else if (node.freeX > width + 8) node.freeX = -8;
          if (node.freeY < -8) node.freeY = height + 8;
          else if (node.freeY > height + 8) node.freeY = -8;
          node.x = node.tx + (node.freeX - node.tx) * blend;
          node.y = node.ty + (node.freeY - node.ty) * blend;
          if (blend >= 1) node.claimAt = null;
          continue;
        }

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
