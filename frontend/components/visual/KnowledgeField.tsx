"use client";

import { useEffect, useRef } from "react";

/**
 * KnowledgeField v2 — "Aurora Iris" signature environment.
 *
 * One WebGL2 context, two draw passes:
 *
 *   Pass A — AURORA. Fullscreen fragment-shader nebula: domain-warped fbm
 *   forms breathing curtains of teal / iris / magenta light that evolve
 *   slowly and gather around the pointer. This is the atmosphere.
 *
 *   Pass B — NODES. The knowledge constellation: thousands of syllabus
 *   nodes drifting through real perspective depth. The field leans as you
 *   move the pointer and while you scroll, and nodes are pushed aside by
 *   an invisible force radiating from the cursor — the page reacts to you.
 *
 * Performance contract (unchanged):
 *  - Zero dependencies. Two hand-written shader programs, ~6KB total.
 *  - All node motion in the vertex shader (mod-wrap drift) — CPU touches
 *    no buffers per frame. Aurora is one fullscreen triangle (gl_VertexID,
 *    no vertex buffers).
 *  - Tiered particle counts (1600/3200/6000). DPR ≤ 1.75 × 0.85 render
 *    scale on fine-pointer devices.
 *  - Aurora runs only on desktop-class viewports (fine pointer ≥1024px);
 *    smaller screens see the CSS cosmic-bg wash beneath the node field.
 *  - Paused when scrolled away or tab hidden. prefers-reduced-motion
 *    renders one composed static frame. WebGL unavailable → renders
 *    nothing; the CSS environment remains.
 *  - Full disposal (buffers, programs, context loss) on unmount.
 */

// ── Pass B shaders ──────────────────────────────────────────────

const NODES_VERT = `#version 300 es
precision mediump float;

in vec3 aPos;
in vec3 aColor;
in float aPhase;

uniform mat4 uProj;
uniform mat4 uView;
uniform float uTime;
uniform float uDepth;
uniform float uSizeBase;
uniform float uDpr;
uniform vec2 uWorld;      // pointer position in world space (z≈-9 plane)
uniform float uRepel;     // eased 0..1 interaction strength

out vec3 vColor;
out float vAlpha;

void main() {
  // Organic pseudo-curl sway layered on the wrapped forward drift.
  vec3 pos = vec3(
    aPos.x + sin(uTime * 0.32 + aPhase) * 0.55,
    aPos.y + cos(uTime * 0.27 + aPhase * 1.7) * 0.45,
    mod(aPos.z + uTime * 0.55, uDepth) - uDepth
  );

  // Pointer repulsion — nodes part around the cursor like dust.
  vec2 dxy = pos.xy - uWorld;
  float dist2 = dot(dxy, dxy);
  pos.xy += normalize(dxy + 1e-4) * (uRepel * 2.6 / (1.0 + dist2 * 0.30));

  vec4 mv = uView * vec4(pos, 1.0);
  gl_Position = uProj * mv;

  float dist = max(0.6, -mv.z);
  gl_PointSize = clamp(uSizeBase * uDpr / dist, 1.2, 26.0);

  float far = smoothstep(-uDepth, -uDepth * 0.82, pos.z);
  float near = smoothstep(0.0, -1.6, pos.z);
  float twinkle = 0.72 + 0.28 * sin(uTime * 1.7 + aPhase);
  vAlpha = far * near * twinkle * clamp(2.6 / dist, 0.25, 1.15);
  vColor = aColor;
}`;

const NODES_FRAG = `#version 300 es
precision mediump float;

in vec3 vColor;
in float vAlpha;
out vec4 frag;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float m = exp(-d * 3.2);
  // Premultiplied coverage so sprites composite correctly over BOTH the
  // opaque aurora pass and the transparent (CSS-backed) canvas.
  frag = vec4(vColor * m * vAlpha, m * vAlpha);
}`;

// ── Pass A shaders ──────────────────────────────────────────────

const AURORA_VERT = `#version 300 es
precision mediump float;

uniform vec2 uRes;
out vec2 vUv;

void main() {
  // Fullscreen triangle from gl_VertexID — no vertex buffers.
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const AURORA_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 frag;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;      // aspect-corrected uv
uniform float uMouseIn;   // eased presence 0..1

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    amp *= 0.55;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / max(1.0, uRes.y);
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.05;

  // Double domain-warp — the signature "living silk" motion.
  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t * 0.7));
  vec2 r = vec2(
    fbm(p * 2.2 + q * 1.6 + vec2(1.7, 9.2) + t * 0.6),
    fbm(p * 2.2 + q * 1.6 + vec2(8.3, 2.8) - t * 0.4)
  );
  float f = fbm(p * 1.8 + r * 1.9);

  float curtain = pow(smoothstep(0.32, 0.95, f), 2.2);

  vec3 base    = vec3(0.016, 0.024, 0.062);  // deep space floor
  vec3 teal    = vec3(0.075, 0.550, 0.500);
  vec3 iris    = vec3(0.290, 0.270, 0.720);
  vec3 magenta = vec3(0.620, 0.220, 0.680);

  vec3 col = base;
  col += iris * curtain * 0.34;
  col += teal * smoothstep(0.55, 0.95, r.x) * curtain * 0.40;

  // Magenta whisper confined to the lower-right sky.
  float region = smoothstep(0.35, 0.85, uv.x) * smoothstep(0.78, 0.22, uv.y);
  col += magenta * smoothstep(0.58, 0.96, q.y) * curtain * region * 0.32;

  // Horizon breath along the top edge.
  col += teal * exp(-uv.y * 3.2) * 0.10;

  // Pointer aura — ambient light gathers near the cursor.
  float md = length(p - uMouse);
  col += teal * exp(-md * md * 7.0) * 0.13 * uMouseIn;
  col += iris * exp(-md * md * 2.6) * 0.06 * uMouseIn;

  // Vignette + film grain.
  col *= 1.0 - 0.38 * pow(length(uv - 0.5) * 1.15, 2.4);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.018;

  frag = vec4(col, 1.0);
}`;

// Palette weighted like the product's signal language:
// dim slate dust with teal / iris / magenta "live" nodes.
const PALETTE: [number, number, number][] = [
  [0.58, 0.63, 0.76], // slate dust
  [0.58, 0.63, 0.76],
  [0.42, 0.46, 0.60],
  [0.18, 0.83, 0.75], // teal
  [0.13, 0.77, 0.87], // cyan bridge
  [0.65, 0.55, 0.98], // iris
  [0.91, 0.48, 0.91], // magenta spark
];

function tierCount(width: number, coarse: boolean): number {
  if (width < 640 || (coarse && width < 900)) return 1600;
  if (width < 1100) return 3200;
  return 6000;
}

function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
}

function viewMatrix(out: Float32Array, pitch: number, yaw: number, camZ: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  // Camera at (0, 0, camZ) rotating in place ("head turn").
  // View = R · p + t, with R = rotX(pitch)·rotY(yaw) and t = -R·(0,0,camZ).
  // Stored column-major for uniformMatrix4fv.
  out[0] = cy;      out[1] = sx * sy;   out[2] = -cx * sy;  out[3] = 0;
  out[4] = 0;       out[5] = cx;        out[6] = sx;        out[7] = 0;
  out[8] = sy;      out[9] = -sx * cy;  out[10] = cx * cy;  out[11] = 0;
  out[12] = -sy * camZ;
  out[13] = sx * cy * camZ;
  out[14] = -cx * cy * camZ;
  out[15] = 1;
}

export default function KnowledgeField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let running = true;
    let visible = true;
    let disposed = false;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) return; // graceful bail — the CSS environment remains

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("KnowledgeField shader:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const link = (vertSrc: string, fragSrc: string): WebGLProgram | null => {
      const vs = compile(gl.VERTEX_SHADER, vertSrc);
      const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
      if (!vs || !fs) return null;
      const p = gl.createProgram()!;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.warn("KnowledgeField link:", gl.getProgramInfoLog(p));
        return null;
      }
      return p;
    };

    const auroraProg = link(AURORA_VERT, AURORA_FRAG);
    const nodesProg = link(NODES_VERT, NODES_FRAG);
    if (!nodesProg) return;

    // ── Node geometry ─────────────────────────────────────────
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const DEPTH = 26;

    const build = (count: number) => {
      const posArr = new Float32Array(count * 3);
      const colArr = new Float32Array(count * 3);
      const phaArr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        posArr[i * 3] = (Math.random() - 0.5) * 28;
        posArr[i * 3 + 1] = (Math.random() - 0.5) * 16;
        posArr[i * 3 + 2] = Math.random() * DEPTH;
        const c = PALETTE[(Math.random() * PALETTE.length) | 0];
        const dim = c === PALETTE[0] || c === PALETTE[1] || c === PALETTE[2];
        const boost = dim ? 0.55 : 1.0;
        colArr[i * 3] = c[0] * boost;
        colArr[i * 3 + 1] = c[1] * boost;
        colArr[i * 3 + 2] = c[2] * boost;
        phaArr[i] = Math.random() * Math.PI * 2;
      }
      return { posArr, colArr, phaArr };
    };

    let count = tierCount(canvas.clientWidth || window.innerWidth, coarse);
    let geom = build(count);

    const bufPos = gl.createBuffer();
    const bufCol = gl.createBuffer();
    const bufPha = gl.createBuffer();

    gl.useProgram(nodesProg);
    const attrPos = gl.getAttribLocation(nodesProg, "aPos");
    const attrCol = gl.getAttribLocation(nodesProg, "aColor");
    const attrPha = gl.getAttribLocation(nodesProg, "aPhase");

    const uploadGeom = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
      gl.bufferData(gl.ARRAY_BUFFER, geom.posArr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attrPos);
      gl.vertexAttribPointer(attrPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufCol);
      gl.bufferData(gl.ARRAY_BUFFER, geom.colArr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attrCol);
      gl.vertexAttribPointer(attrCol, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufPha);
      gl.bufferData(gl.ARRAY_BUFFER, geom.phaArr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attrPha);
      gl.vertexAttribPointer(attrPha, 1, gl.FLOAT, false, 0, 0);
    };
    uploadGeom();

    // ── Uniforms ──────────────────────────────────────────────
    const nProj = gl.getUniformLocation(nodesProg, "uProj");
    const nView = gl.getUniformLocation(nodesProg, "uView");
    const nTime = gl.getUniformLocation(nodesProg, "uTime");
    const nDepth = gl.getUniformLocation(nodesProg, "uDepth");
    const nSize = gl.getUniformLocation(nodesProg, "uSizeBase");
    const nDpr = gl.getUniformLocation(nodesProg, "uDpr");
    const nWorld = gl.getUniformLocation(nodesProg, "uWorld");
    const nRepel = gl.getUniformLocation(nodesProg, "uRepel");

    let aRes: WebGLUniformLocation | null = null;
    let aTime: WebGLUniformLocation | null = null;
    let aMouse: WebGLUniformLocation | null = null;
    let aMouseIn: WebGLUniformLocation | null = null;
    if (auroraProg) {
      gl.useProgram(auroraProg);
      aRes = gl.getUniformLocation(auroraProg, "uRes");
      aTime = gl.getUniformLocation(auroraProg, "uTime");
      aMouse = gl.getUniformLocation(auroraProg, "uMouse");
      aMouseIn = gl.getUniformLocation(auroraProg, "uMouseIn");
    }

    gl.useProgram(nodesProg);
    gl.uniform1f(nDepth, DEPTH);
    // Premultiplied-over blending: reads as additive on the dark aurora,
    // composites cleanly onto the page when the canvas is transparent.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // ── Sizing ────────────────────────────────────────────────
    const proj = new Float32Array(16);
    const view = new Float32Array(16);
    let dprScale = 1;

    // Aurora is a dark-scene artwork: only run it while the site is dark
    // AND on desktop-class viewports; elsewhere the canvas stays additive
    // over the CSS cosmic-bg.
    const auroraActive = () =>
      Boolean(auroraProg) &&
      window.innerWidth >= 1024 &&
      !coarse &&
      !document.documentElement.classList.contains("light");

    const resize = () => {
      const rawDpr = window.devicePixelRatio || 1;
      dprScale = coarse ? Math.min(rawDpr, 1.75) : Math.min(rawDpr, 1.75) * 0.85;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dprScale);
      canvas.height = Math.round(h * dprScale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      perspective(proj, (58 * Math.PI) / 180, w / h, 0.5, 80);
      gl.uniformMatrix4fv(nProj, false, proj);

      const next = tierCount(w, coarse);
      if (next !== count) {
        count = next;
        geom = build(count);
        uploadGeom();
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Interaction (lerped MotionValue-style, zero React state) ──
    let ndcX = 0, ndcY = 0;           // -1..1 pointer
    let smX = 0, smY = 0;             // smoothed
    let repel = 0, targetRepel = 0;
    let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
    let scrollLean = 0;

    const onPointer = (e: PointerEvent) => {
      ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      ndcY = -((e.clientY / window.innerHeight) * 2 - 1);
      targetYaw = ((e.clientX / window.innerWidth) - 0.5) * 0.24;
      targetPitch = ((e.clientY / window.innerHeight) - 0.5) * -0.16;
      targetRepel = 1;
    };
    const onLeave = () => {
      targetRepel = 0;
    };

    // ── Frame ─────────────────────────────────────────────────
    const CAM_Z = 7.5;

    const drawFrame = (t: number) => {
      const useAurora = auroraActive();

      // Smoothed interaction state.
      smX += (ndcX - smX) * 0.06;
      smY += (ndcY - smY) * 0.06;
      repel += (targetRepel - repel) * 0.05;
      yaw += (targetYaw - yaw) * 0.045;
      pitch += (targetPitch - pitch) * 0.045;

      if (useAurora && !reduceMotion) {
        scrollLean += (window.scrollY - scrollLean) * 0.04;
      }

      // Pass A — aurora owns the backdrop on desktop dark mode.
      if (useAurora && auroraProg) {
        gl.disable(gl.BLEND);
        gl.useProgram(auroraProg);
        gl.uniform2f(aRes, canvas.width, canvas.height);
        gl.uniform1f(aTime, t + scrollLean * 0.004);
        // Aspect-corrected pointer uv matching the p-space in the shader.
        const aspect = canvas.width / Math.max(1, canvas.height);
        gl.uniform2f(aMouse, (smX * 0.5 + 0.5) * aspect, smY * 0.5 + 0.5);
        gl.uniform1f(aMouseIn, repel > 0.01 ? Math.min(1, repel * 1.4) : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      // Pass B — node field.
      gl.enable(gl.BLEND);
      gl.useProgram(nodesProg);
      // Project smoothed NDC pointer onto the z≈-9 interaction plane.
      const planeZ = CAM_Z - 9;
      const halfH = Math.tan((58 * Math.PI) / 360) * planeZ;
      const halfW = halfH * (canvas.width / Math.max(1, canvas.height));
      gl.uniform2f(nWorld, smX * halfW, smY * halfH);
      gl.uniform1f(nRepel, repel);
      viewMatrix(view, pitch, yaw, CAM_Z);
      gl.uniformMatrix4fv(nView, false, view);
      gl.uniform1f(nTime, t);
      gl.uniform1f(nSize, 46);
      gl.uniform1f(nDpr, dprScale);
      gl.drawArrays(gl.POINTS, 0, count);
    };

    const start = performance.now();
    const loop = (now: number) => {
      if (!running || disposed) return;
      if (!visible || document.hidden) {
        raf = requestAnimationFrame(loop); // stay parked, render nothing
        return;
      }
      drawFrame((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };

    if (reduceMotion) {
      drawFrame(4.0); // one composed static frame
    } else {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("pointerleave", onLeave, { passive: true });
      raf = requestAnimationFrame(loop);
    }

    // ── Pause offscreen ───────────────────────────────────────
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.02 },
    );
    io.observe(canvas);

    // ── Dispose ───────────────────────────────────────────────
    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(bufPos);
      gl.deleteBuffer(bufCol);
      gl.deleteBuffer(bufPha);
      if (auroraProg) gl.deleteProgram(auroraProg);
      gl.deleteProgram(nodesProg);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`h-full w-full ${className}`}
    />
  );
}
