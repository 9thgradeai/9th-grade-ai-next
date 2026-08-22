"use client";

import { useEffect, useRef } from "react";

/**
 * KnowledgeField — the page's signature environment.
 *
 * A 3D field of drifting "syllabus nodes" rendered with a single WebGL2
 * draw call and hand-written shaders (~4KB total, zero dependencies).
 * Nodes drift toward the camera on a wrapped z-axis; the whole field leans
 * gently toward the pointer. It is the product made visible: scattered
 * topics resolving into depth.
 *
 * Performance contract:
 *  - No three.js/R3F — one <canvas>, one program, one VAO-equivalent state.
 *  - All motion happens in the vertex shader (mod-wrap), so the CPU touches
 *    no buffers per frame.
 *  - Particle count tiers by viewport + pointer type (1600/3200/6000).
 *  - DPR capped at 1.75. Paused when scrolled away or tab hidden.
 *  - prefers-reduced-motion renders a single static frame — still beautiful,
 *    zero animation.
 *  - WebGL unavailable → renders nothing; the cosmic-bg gradient remains.
 */

const VERT = `#version 300 es
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

out vec3 vColor;
out float vAlpha;

void main() {
  // Wrapped forward drift — nodes flow past the camera forever.
  vec3 pos = vec3(aPos.xy, mod(aPos.z + uTime * 0.55, uDepth) - uDepth);

  vec4 mv = uView * vec4(pos, 1.0);
  gl_Position = uProj * mv;

  float dist = max(0.6, -mv.z);
  gl_PointSize = clamp(uSizeBase * uDpr / dist, 1.2, 26.0);

  // Fade at both ends of the tunnel so wraps are invisible.
  float far = smoothstep(-uDepth, -uDepth * 0.82, pos.z);
  float near = smoothstep(0.0, -1.6, pos.z);
  float twinkle = 0.72 + 0.28 * sin(uTime * 1.7 + aPhase);
  vAlpha = far * near * twinkle * clamp(2.6 / dist, 0.25, 1.15);
  vColor = aColor;
}`;

const FRAG = `#version 300 es
precision mediump float;

in vec3 vColor;
in float vAlpha;
out vec4 frag;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float m = exp(-d * 3.2);           // soft gaussian sprite
  frag = vec4(vColor * m * vAlpha, 1.0);
}`;

// Palette weighted like the product's signal language:
// mostly dim slate dust with emerald/cyan/indigo "live" nodes.
const PALETTE: [number, number, number][] = [
  [0.58, 0.64, 0.72], // slate
  [0.58, 0.64, 0.72],
  [0.42, 0.47, 0.56],
  [0.20, 0.83, 0.60], // emerald
  [0.13, 0.77, 0.87], // cyan
  [0.51, 0.55, 0.97], // indigo
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
    if (!gl) return; // graceful bail — cosmic-bg remains

    // ── Program ──────────────────────────────────────────────
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("KnowledgeField shader:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("KnowledgeField link:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // ── Geometry ─────────────────────────────────────────────
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const DEPTH = 26;
    const SPREAD_X = 14;
    const SPREAD_Y = 8;

    const build = (count: number) => {
      const posArr = new Float32Array(count * 3);
      const colArr = new Float32Array(count * 3);
      const phaArr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        posArr[i * 3] = (Math.random() - 0.5) * 2 * SPREAD_X;
        posArr[i * 3 + 1] = (Math.random() - 0.5) * 2 * SPREAD_Y;
        posArr[i * 3 + 2] = Math.random() * DEPTH;
        const c = PALETTE[(Math.random() * PALETTE.length) | 0];
        const boost = c === PALETTE[0] || c === PALETTE[1] || c === PALETTE[2] ? 0.55 : 1.0;
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

    const attrPos = gl.getAttribLocation(prog, "aPos");
    const attrCol = gl.getAttribLocation(prog, "aColor");
    const attrPha = gl.getAttribLocation(prog, "aPhase");

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

    // ── Uniforms & blending ─────────────────────────────────
    const uProj = gl.getUniformLocation(prog, "uProj");
    const uView = gl.getUniformLocation(prog, "uView");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uDepth = gl.getUniformLocation(prog, "uDepth");
    const uSize = gl.getUniformLocation(prog, "uSizeBase");
    const uDpr = gl.getUniformLocation(prog, "uDpr");

    gl.uniform1f(uDepth, DEPTH);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive — light accumulates over the void

    // ── Sizing ───────────────────────────────────────────────
    const proj = new Float32Array(16);
    const view = new Float32Array(16);
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      perspective(proj, (58 * Math.PI) / 180, w / h, 0.5, 80);
      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniform1f(uDpr, dpr);

      // Re-tier once if the first measurement was pre-layout.
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

    // ── Pointer parallax (lerped, no React state) ────────────
    let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
    const onPointer = (e: PointerEvent) => {
      targetYaw = ((e.clientX / window.innerWidth) - 0.5) * 0.24;
      targetPitch = ((e.clientY / window.innerHeight) - 0.5) * -0.16;
    };

    // ── Frame loop ───────────────────────────────────────────
    const CAM_Z = 7.5;
    const drawFrame = (t: number) => {
      viewMatrix(view, pitch, yaw, CAM_Z);
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uSize, 46);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
    };

    const start = performance.now();
    const loop = (now: number) => {
      if (!running || disposed) return;
      if (!visible || document.hidden) {
        raf = requestAnimationFrame(loop); // stay parked, render nothing
        return;
      }
      yaw += (targetYaw - yaw) * 0.045;
      pitch += (targetPitch - pitch) * 0.045;
      drawFrame((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };

    if (reduceMotion) {
      drawFrame(4.0); // one composed static frame
    } else {
      window.addEventListener("pointermove", onPointer, { passive: true });
      raf = requestAnimationFrame(loop);
    }

    // ── Pause offscreen / hidden ─────────────────────────────
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.02 },
    );
    io.observe(canvas);

    // ── Dispose ──────────────────────────────────────────────
    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(bufPos);
      gl.deleteBuffer(bufCol);
      gl.deleteBuffer(bufPha);
      gl.deleteProgram(prog);
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
