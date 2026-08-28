"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionCapabilities, useVisualQuality } from "@/lib/motion/device";

/**
 * Real-time black hole rendered with raw WebGL — no three.js, no camera libs.
 *
 * Photon paths are integrated through curved space (a = -1.5·h²·p/r⁵). Rays that
 * cross the event horizon (r < 1) are swallowed → the black shadow. A *volumetric*
 * accretion disk (emissive slab in the y = 0 plane) is accumulated every step, so
 * lensing bends the far side of the disk up and over the shadow into the iconic
 * Einstein-ring arc. A bright photon ring hugs the shadow edge (min approach ≈
 * 1.5·Rs), the approaching side is Doppler-beamed, and the camera slowly *orbits*
 * the hole so the scene moves on its own. Stars + nebula fill the background.
 *
 * Stability & performance (the priority here):
 *  - Render scale ADAPTS with hysteresis + a deadband: it starts conservative and
 *    only ramps DOWN hard when FPS is clearly bad, only ramps UP when there is clear
 *    headroom — so it never oscillates the canvas size frame-to-frame (no flicker).
 *  - DPR is capped; step count is chosen per device tier at compile time.
 *  - No per-frame allocations; the loop does one draw call.
 *  - A static, time-independent dither kills 8-bit banding (no shimmer).
 *  - Renders one frame synchronously at mount (no blank flash) and pauses when the
 *    tab is hidden OR the hero is scrolled out of view.
 *  - Recovers to a calm void if the WebGL context is ever lost (no crash).
 *  - Reduced / low tiers render a single static frame and never loop.
 */

type Quality = ReturnType<typeof useVisualQuality>;

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

function buildFrag(steps: number): string {
  return `precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;

const float EH = 1.0;
const float DISK_IN = 2.2;
const float DISK_OUT = 8.5;
const int STEPS = ${steps};
const float ESCAPE = 60.0;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 diskColor(float t) {
  // t: 0 inner (hot, blue-white) -> 1 outer (cool, deep orange-red)
  vec3 hot  = vec3(0.75, 0.86, 1.0);
  vec3 mid  = vec3(1.0, 0.82, 0.5);
  vec3 cool = vec3(1.0, 0.35, 0.1);
  vec3 c = mix(hot, mid, smoothstep(0.0, 0.25, t));
  c = mix(c, cool, smoothstep(0.25, 1.0, t));
  return c;
}

vec3 starField(vec3 dir) {
  vec3 d = normalize(dir);
  float band = exp(-(d.y * d.y) * 2.6);
  // Kept very dark so the cosmos reads as deep space, not a lit fog.
  vec3 neb = mix(vec3(0.0015, 0.002, 0.005), vec3(0.008, 0.005, 0.014), 0.5 + 0.5 * d.y);
  neb += band * vec3(0.008, 0.005, 0.012);
  neb += (1.0 - band) * vec3(0.002, 0.003, 0.006);
  vec3 col = neb;
  for (int k = 0; k < 3; k++) {
    float sc = 90.0 + float(k) * 60.0;
    vec3 q = d * sc;
    vec3 cell = floor(q);
    float h = hash31(cell + float(k) * 23.0);
    // Sparse, faint stars for a realistic deep-space field.
    if (h > 0.993) {
      vec3 f = fract(q) - 0.5;
      float d2 = dot(f, f);
      float s = smoothstep(0.18, 0.0, d2) * (0.5 + 0.5 * hash31(cell + 5.0)) * 0.7;
      vec3 tint = mix(vec3(0.8, 0.86, 1.0), vec3(1.0, 0.9, 0.75), hash31(cell + 11.0));
      col += tint * s;
    }
  }
  return col;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 ptr = u_pointer;

  // Self-orbiting camera (slow), with subtle pointer parallax on top.
  float orbit = u_time * 0.06 + ptr.x * 0.5;
  float R = 16.0;
  vec3 pos = vec3(
    sin(orbit) * R,
    0.9 + ptr.y * 0.9 + sin(u_time * 0.25) * 0.12,
    -cos(orbit) * R
  );
  vec3 fwd = normalize(-pos);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rgt, fwd);
  vec3 dir = normalize(fwd + (uv.x * rgt + uv.y * up) * 1.2);

  float h2 = dot(cross(pos, dir), cross(pos, dir));
  vec3 color = vec3(0.0);
  float trans = 1.0;
  bool captured = false;
  float minR = 1e9;

  for (int i = 0; i < STEPS; i++) {
    float r = length(pos);
    minR = min(minR, r);
    if (r < EH) { captured = true; break; }
    if (r > ESCAPE && dot(pos, dir) > 0.0) break;

    vec3 pPrev = pos;
    float dt = 0.07 + r * 0.035;
    vec3 accel = -1.5 * h2 * pos / pow(r, 5.0);
    dir += accel * dt;
    pos += dir * dt;

    // Volumetric accretion disk — emitted every step the ray is inside the slab.
    float rad = length(pos.xz);
    if (rad > DISK_IN && rad < DISK_OUT) {
      float tn = (rad - DISK_IN) / (DISK_OUT - DISK_IN);
      float thick = mix(0.25, 0.06, tn);
      float vert = exp(-(pos.y * pos.y) / (thick * thick));
      vec3 base = diskColor(tn);
      float ang = atan(pos.z, pos.x);
      float spin = u_time * (1.5 / (0.25 + tn)) + rad * 0.9;
      // Smooth, temporally-coherent turbulence (no per-frame hash → no shimmer).
      float turb = 0.55 + 0.45 * sin(ang * 2.0 + spin);
      turb *= 0.7 + 0.3 * sin(ang * 5.0 - spin * 1.3 + rad * 1.7);
      turb *= 0.9 + 0.1 * sin(rad * 0.8 - spin * 0.4);
      float radial = (1.0 - smoothstep(DISK_OUT * 0.72, DISK_OUT, rad))
                   * smoothstep(DISK_IN, DISK_IN * 1.6, rad);
      vec3 vel = normalize(vec3(-pos.z, 0.0, pos.x));
      float dop = dot(vel, -dir);
      float beam = pow(clamp(0.5 + 0.5 * dop, 0.0, 1.0), 3.0);
      float emiss = vert * radial * turb * (0.22 + 2.4 * beam) * mix(1.0, 1.7, 1.0 - tn);
      color += base * emiss * dt * trans * 1.6;
      trans *= exp(-emiss * dt * 0.7);
    }
  }

  if (!captured) {
    color += starField(dir) * trans;
  }

  // Bright photon ring hugging the shadow (min approach ≈ photon sphere).
  float rd = (minR - 1.5) / 0.09;
  float ring = exp(-rd * rd);
  color += vec3(1.0, 0.72, 0.42) * ring * (captured ? 1.15 : 0.55);

  // Soft volumetric halo for depth (kept subtle so the disk reads crisp).
  float hd = (minR - 3.0) / 2.0;
  color += vec3(0.5, 0.4, 0.7) * exp(-hd * hd) * 0.035;

  // Cinematic grade: ACES tonemap, vignette, cool shadow lift.
  color = aces(color * 1.2);
  float vig = smoothstep(1.25, 0.2, length(uv));
  color *= mix(0.3, 1.0, vig);
  color += vec3(0.0, 0.01, 0.02) * (1.0 - vig) * 0.3;
  color = pow(color, vec3(0.4545));

  // Static dither to break 8-bit banding (no time term → no shimmer).
  float dither = (hash11(gl_FragCoord.x * 12.9898 + gl_FragCoord.y * 78.233) - 0.5) / 255.0;
  color += dither;
  gl_FragColor = vec4(color, 1.0);
}
`;
}

function qualityParams(q: Quality): { scale: number; dprCap: number; steps: number } {
  switch (q) {
    case "ultra":
      return { scale: 1.0, dprCap: 2.0, steps: 240 };
    case "high":
      return { scale: 0.95, dprCap: 2.0, steps: 200 };
    case "medium":
      return { scale: 0.8, dprCap: 1.5, steps: 160 };
    case "low":
    case "reduced":
    default:
      return { scale: 0.6, dprCap: 1.25, steps: 120 };
  }
}

/**
 * A phone can report a "high" CPU tier (many cores) yet have a weak GPU, and a
 * 4K desktop can be assigned "ultra". Coarse pointers and small viewports are
 * still capped so the effect stays smooth on phones/tablets and small windows,
 * but the caps are set high enough to stay crisp (native-ish DPR, sharp disk).
 */
function clampRenderTier(
  base: { scale: number; dprCap: number; steps: number },
  minSide: number,
  coarse: boolean,
): { scale: number; dprCap: number; steps: number } {
  let { scale, dprCap, steps } = base;
  if (coarse || minSide < 540) {
    steps = Math.min(steps, 140);
    scale = Math.min(scale, 0.7);
    dprCap = Math.min(dprCap, 1.5);
  } else if (minSide < 760) {
    steps = Math.min(steps, 180);
    scale = Math.min(scale, 0.85);
  }
  return { scale, dprCap, steps };
}

export default function BlackholeCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const quality = useVisualQuality();
  const { continuousEffects, pointerEffects } = useMotionCapabilities();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl: WebGLRenderingContext | null =
      (canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      setFailed(true);
      return;
    }

    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 720;
    const coarse =
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const params = clampRenderTier(qualityParams(quality), Math.min(vw, vh), coarse);
    const frag = buildFrag(params.steps);

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("Blackhole shader compile failed:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) {
      setFailed(true);
      return;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Blackhole program link failed:", gl.getProgramInfoLog(program));
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uPointer = gl.getUniformLocation(program, "u_pointer");

    let raf = 0;
    let running = false;
    let inView = true;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    // Adaptive internal resolution. Start near the tier ceiling (crisp) and only
    // ramp DOWN when FPS is clearly bad; ramp back UP when there is headroom.
    // Wide deadband => the canvas size never oscillates frame-to-frame.
    let scale = Math.min(params.scale, 0.85);
    const SCALE_FLOOR = Math.min(0.4, params.scale);
    const SCALE_CEIL = params.scale;
    // Hard ceiling on the longest internal edge so 4K / very large canvases can
    // never exceed the GPU budget regardless of tier.
    const MAX_DIM = 3200;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, params.dprCap);
      let w = Math.max(1, Math.floor(rect.width * dpr * scale));
      let h = Math.max(1, Math.floor(rect.height * dpr * scale));
      const longest = Math.max(w, h);
      if (longest > MAX_DIM) {
        const k = MAX_DIM / longest;
        w = Math.floor(w * k);
        h = Math.floor(h * k);
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    };

    const onPointer = (e: PointerEvent) => {
      if (!pointerEffects) return;
      const rect = canvas.getBoundingClientRect();
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      target.y = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    // --- run-state management: only animate when visible AND on-screen ---
    // Continuous orbit is allowed on every device (incl. touch / small
    // viewports) — the quality tier + adaptive scaler keep it smooth. We no
    // longer freeze the canvas on mobile; prefers-reduced-motion users still
    // get a single static frame via `continuousEffects` being false.
    const updateRun = () => {
      const should =
        continuousEffects &&
        document.visibilityState === "visible" &&
        inView;
      if (should && !running) {
        running = true;
        // Resume the clock from where it paused (no absolute-time jump).
        lastSimNow = performance.now();
        lastFrame = performance.now();
        raf = requestAnimationFrame(loop);
      } else if (!should && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
      }
    };

    // Accumulated animation clock — advances ONLY while the loop runs, so
    // scrolling away and back (or a tab switch) resumes seamlessly instead of
    // jumping the camera to a new absolute-time angle. Clamped so a stalled
    // frame (GC / throttled tab) can't lurch the scene during a long session.
    let simTime = 0;
    let lastSimNow = performance.now();

    const render = (timeSec: number) => {
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, timeSec);
      gl.uniform2f(uPointer, current.x, current.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let lastFrame = performance.now();
    let perfFrames = 0;
    let perfAcc = 0;
    const adapt = (now: number) => {
      const dt = now - lastFrame;
      lastFrame = now;
      perfAcc += dt;
      perfFrames++;
      if (perfFrames < 45) return; // long window => ignore single hiccups
      const avg = perfAcc / perfFrames;
      perfFrames = 0;
      perfAcc = 0;
      if (avg > 30 && scale > SCALE_FLOOR) {
        scale = Math.max(SCALE_FLOOR, scale - 0.12);
        resize();
      } else if (avg < 14 && scale < SCALE_CEIL) {
        scale = Math.min(SCALE_CEIL, scale + 0.08);
        resize();
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      const frameDt = (now - lastSimNow) / 1000;
      lastSimNow = now;
      simTime += Math.min(0.05, frameDt);
      render(continuousEffects ? simTime : 0);
      adapt(now);
      raf = requestAnimationFrame(loop);
    };

    // Draw one frame immediately so there is never a blank/transparent gap.
    resize();
    render(0);
    if (continuousEffects && pointerEffects) {
      window.addEventListener("pointermove", onPointer, { passive: true });
    }
    document.addEventListener("visibilitychange", updateRun);
    updateRun();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    // Re-fit if the element's box changes after first paint (fonts, late layout).
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    // Pause when scrolled out of view (saves GPU/battery; no offscreen waste).
    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        updateRun();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    // If the GPU loses the context, fail gracefully to the static void (no crash).
    const onLost = (e: Event) => {
      e.preventDefault();
      running = false;
      if (raf) cancelAnimationFrame(raf);
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost as EventListener);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", updateRun);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost as EventListener);
      // Do NOT call loseContext(): React Strict Mode remounts the effect on the
      // same canvas, and a lost context stays dead — every draw becomes a no-op.
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [quality, continuousEffects, pointerEffects]);

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${className}`}
        style={{
          background:
            "radial-gradient(circle at 50% 46%, #1b1130 0%, #0a0a14 38%, #050507 70%)",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ background: "#050507" }}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
