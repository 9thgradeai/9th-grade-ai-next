import { useEffect, useRef, useState } from "react";
import { ActivationDirector } from "./activationSystem";
import { PerformanceManager } from "./performance-manager";
import {
  ACTIVATION,
  QUALITY_PRESETS,
  TIER_START_QUALITY,
  resolveConfig,
  type HeroQuality,
} from "./config";
import { generateNetwork, MAX_NEURONS, type Network, type SceneTier } from "./neuralGenerator";
import { LINE_FS, LINE_VS, PARTICLE_FS, PARTICLE_VS, SOMA_FS, SOMA_VS } from "./shaders";
import NeuralFallback from "./NeuralFallback";

function detectTier(): SceneTier {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (window.innerWidth < 768) return "mobile";
  if (coarse || window.innerWidth < 1180) return "tablet";
  return "desktop";
}

type Mat4 = Float32Array;

const IDENTITY: Mat4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function perspectiveInto(out: Mat4, fovY: number, aspect: number, near: number, far: number): void {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

const TMP_A: Mat4 = new Float32Array(16);
const TMP_B: Mat4 = new Float32Array(16);
const TMP_PIVOT_NEG: Mat4 = (() => {
  const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  m[12] = -0.3; m[13] = -0.04;
  return m;
})();
const TMP_PIVOT_POS: Mat4 = (() => {
  const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  m[12] = 0.3; m[13] = 0.04;
  return m;
})();

function viewMatrixInto(out: Mat4, yaw: number, pitch: number, camZ: number): void {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  // column-major rotation + translation (eye on +Z)
  TMP_A[0] = cy; TMP_A[1] = sy * sx; TMP_A[2] = sy * cx; TMP_A[3] = 0;
  TMP_A[4] = 0; TMP_A[5] = cx; TMP_A[6] = -sx; TMP_A[7] = 0;
  TMP_A[8] = -sy; TMP_A[9] = cy * sx; TMP_A[10] = cy * cx; TMP_A[11] = 0;
  TMP_A[12] = -((-sy) * camZ);
  TMP_A[13] = -((cy * sx) * camZ);
  TMP_A[14] = -((cy * cx) * camZ);
  TMP_A[15] = 1;
  // M = T(+pivot) * A * T(-pivot), pivot = (0.3, 0.04, 0)
  multiplyInto(TMP_B, TMP_A, TMP_PIVOT_NEG);
  multiplyInto(out, TMP_PIVOT_POS, TMP_B);
}

function multiplyInto(o: Mat4, a: Mat4, b: Mat4): void {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}

interface ProgramBundle {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

// eslint-disable-next-line no-restricted-globals
const IS_DEV = process.env.NODE_ENV !== "production";

export default function NeuralScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || fallback) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      console.warn("[NeuralScene] reduced-motion preference active — rendering static composition");
    }

    let cleanup: (() => void) | undefined;
    const tInitStart = performance.now();
    try {
      cleanup = init();
    } catch (err) {
      console.warn("[NeuralScene] init crashed", err);
    }
    if (!cleanup) {
      console.warn("[NeuralScene] WebGL initialization failed — static artwork fallback");
      queueMicrotask(() => setFallback(true));
      return;
    }
    return cleanup;

    function init(): (() => void) | undefined {
    if (!host) return undefined;
    const tier = detectTier();
    const startQuality = TIER_START_QUALITY[tier];
    const cfg = resolveConfig(tier, startQuality);
    if (!cfg) return undefined;
    const perf = reduced ? null : new PerformanceManager(startQuality);
    let level = startQuality;

    const tGenStart = performance.now();
    const network: Network = generateNetwork(cfg);
    const genMs = performance.now() - tGenStart;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
    host.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "low-power",
      desynchronized: true,
    });
    if (!gl) {
      console.warn("[NeuralScene] WebGL2 unavailable — CSS atmosphere only");
      canvas.remove();
      return undefined;
    }

    let disposed = false;
    let rafId = 0;
    let running = false;
    let inView = true;
    let simT = 0;
    let lastNow = performance.now();
    let mouseX = 0;
    let mouseY = 0;
    let curX = 0;
    let curY = 0;

    const compile = (vsSrc: string, fsSrc: string): WebGLProgram | null => {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      if (!vs || !fs) return null;
      gl.shaderSource(vs, vsSrc);
      gl.compileShader(vs);
      gl.shaderSource(fs, fsSrc);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.warn("[NeuralScene] shader compile failed", gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
        return null;
      }
      const p = gl.createProgram();
      if (!p) return null;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.warn("[NeuralScene] link failed", gl.getProgramInfoLog(p));
        return null;
      }
      return p;
    };

    const bundle = (vsSrc: string, fsSrc: string, names: string[]): ProgramBundle | null => {
      const program = compile(vsSrc, fsSrc);
      if (!program) return null;
      const uniforms: Record<string, WebGLUniformLocation | null> = {};
      for (const n of names) uniforms[n] = gl.getUniformLocation(program, n);
      return { program, uniforms };
    };

    const tCompileStart = performance.now();
    const lineB = bundle(LINE_VS, LINE_FS, [
      "uVP", "uModel", "uRes", "uWidthScale", "uTime",
      "uAct", "uPulseCount", "uPulseSrc", "uPulseR", "uPulseI",
      "uDisCount", "uDisC", "uDisR", "uDisS",
    ]);
    const somaB = bundle(SOMA_VS, SOMA_FS, [
      "uVP", "uModel", "uRight", "uUp", "uTime",
      "uAct", "uPulseCount", "uPulseSrc", "uPulseR", "uPulseI",
      "uDisCount", "uDisC", "uDisR", "uDisS",
    ]);
    const partB = bundle(PARTICLE_VS, PARTICLE_FS, [
      "uVP", "uModel", "uRes", "uTime", "uAmbient",
      "uAct", "uPulseCount", "uPulseSrc", "uPulseR", "uPulseI",
      "uDisCount", "uDisC", "uDisR", "uDisS",
    ]);
    const compileMs = performance.now() - tCompileStart;

    if (!lineB || !somaB || !partB) {
      canvas.remove();
      return undefined;
    }

    const actData = new Float32Array(MAX_NEURONS);
    const pulseSrcData = new Float32Array(18);
    const pulseRData = new Float32Array(6);
    const pulseIData = new Float32Array(6);
    const disCData = new Float32Array(12);
    const disRData = new Float32Array(4);
    const disSData = new Float32Array(4);

    const PROJ_M: Mat4 = new Float32Array(16);
    const VIEW_M: Mat4 = new Float32Array(16);
    const VP_M: Mat4 = new Float32Array(16);
    const RIGHT: [number, number, number] = [1, 0, 0];
    const UP: [number, number, number] = [0, 1, 0];

    // ── geometry upload ─────────────────────────────────────────
    const segsPerVertFloats = 11;
    const lineVerts = network.segs.length * 4;
    const lineData = new Float32Array(lineVerts * segsPerVertFloats);
    const lineIndices = new Uint32Array(network.segs.length * 6);

    {
      let vi = 0;
      let ii = 0;
      let vertBase = 0;
      for (const s of network.segs) {
        for (let v = 0; v < 4; v++) {
          const side = v === 0 || v === 2 ? -1 : 1;
          const isA = v === 0 || v === 1;
          const o = vi * segsPerVertFloats;
          lineData[o] = isA ? s.ax : s.bx;
          lineData[o + 1] = isA ? s.ay : s.by;
          lineData[o + 2] = isA ? s.az : s.bz;
          lineData[o + 3] = isA ? s.bx : s.ax;
          lineData[o + 4] = isA ? s.by : s.ay;
          lineData[o + 5] = isA ? s.bz : s.az;
          lineData[o + 6] = side;
          lineData[o + 7] = s.width;
          lineData[o + 8] = s.id;
          lineData[o + 9] = s.dim;
          lineData[o + 10] = s.birth;
          vi++;
        }
        lineIndices[ii++] = vertBase;
        lineIndices[ii++] = vertBase + 1;
        lineIndices[ii++] = vertBase + 2;
        lineIndices[ii++] = vertBase + 1;
        lineIndices[ii++] = vertBase + 3;
        lineIndices[ii++] = vertBase + 2;
        vertBase += 4;
      }
    }

    const somaInstances = network.neurons.length;
    const somaData = new Float32Array(somaInstances * 9);
    network.neurons.forEach((n, i) => {
      const o = i * 9;
      somaData[o] = n.pos[0];
      somaData[o + 1] = n.pos[1];
      somaData[o + 2] = n.pos[2];
      somaData[o + 3] = n.size;
      somaData[o + 4] = n.seed;
      somaData[o + 5] = i;
      somaData[o + 6] = n.dim;
      somaData[o + 7] = n.birth;
    });

    // neural fragments first, ambient motes after — one VBO, ranged draws
    const neuralCount = network.particles.length;
    const ambientCount = network.ambient.length;
    const totalCount = neuralCount + ambientCount;
    const particleData = new Float32Array(totalCount * 7);
    const writeParticle = (i: number, p: { pos: [number, number, number]; size: number; seed: number; amp: number; dim: number }) => {
      const o = i * 7;
      particleData[o] = p.pos[0];
      particleData[o + 1] = p.pos[1];
      particleData[o + 2] = p.pos[2];
      particleData[o + 3] = p.size;
      particleData[o + 4] = p.seed;
      particleData[o + 5] = p.amp;
      particleData[o + 6] = p.dim;
    };
    network.particles.forEach((p, i) => writeParticle(i, p));
    network.ambient.forEach((m, k) => writeParticle(neuralCount + k, m));

    // energy travelers: small per-frame dynamic buffer (spec §10)
    const MAX_TRAVELERS = ACTIVATION.maxTravelers;
    const travelerData = new Float32Array(MAX_TRAVELERS * 7);
    for (let i = 0; i < MAX_TRAVELERS; i++) {
      travelerData[i * 7 + 4] = (i * 0.6180339887) % 1;
      travelerData[i * 7 + 5] = 0;
    }
    const travelerPos = new Float32Array(MAX_TRAVELERS * 3);
    const travelerDim = new Float32Array(MAX_TRAVELERS);
    const travelerSize = new Float32Array(MAX_TRAVELERS);

    const makeVao = (
      data: Float32Array,
      layout: [number, number][],
      indices?: Uint32Array,
    ): [WebGLVertexArrayObject, WebGLBuffer, WebGLBuffer | null] | null => {
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      if (!vao || !vbo) return null;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      let stride = 0;
      for (const [, size] of layout) stride += size * 4;
      let offset = 0;
      layout.forEach(([loc, size]) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        offset += size * 4;
      });
      let ibo: WebGLBuffer | null = null;
      if (indices) {
        ibo = gl.createBuffer();
        if (!ibo) return null;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      }
      gl.bindVertexArray(null);
      return [vao, vbo, ibo];
    };

    const lineLayout: [number, number][] = [
      [0, 3], [1, 3], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    ];
    const somaLayoutInst: [number, number][] = [
      [1, 3], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    ];
    const partLayout: [number, number][] = [[0, 3], [1, 1], [2, 1], [3, 1], [4, 1]];

    const cornerBuf = gl.createBuffer();
    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    const lineVao = makeVao(lineData, lineLayout, lineIndices);
    const somaVaoPair = (() => {
      const vao = gl.createVertexArray();
      if (!vao || !cornerBuf) return null;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const vbo = gl.createBuffer();
      if (!vbo) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, somaData, gl.STATIC_DRAW);
      let off = 0;
      somaLayoutInst.forEach(([loc, size]) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 24, off);
        gl.vertexAttribDivisor(loc, 1);
        off += size * 4;
      });
      gl.vertexAttribDivisor(0, 0);
      gl.bindVertexArray(null);
      return [vao, vbo] as const;
    })();
    const partVao = makeVao(particleData, partLayout);

    const travelerVaoPair = (() => {
      const vao = gl.createVertexArray();
      if (!vao) return null;
      const vbo = gl.createBuffer();
      if (!vbo) return null;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, travelerData, gl.DYNAMIC_DRAW);
      let off = 0;
      partLayout.forEach(([loc, size]) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 28, off);
        off += size * 4;
      });
      gl.bindVertexArray(null);
      return [vao, vbo] as const;
    })();

    if (!lineVao || !somaVaoPair || !partVao || !travelerVaoPair) {
      canvas.remove();
      return undefined;
    }

    const director = new ActivationDirector(network, reduced);

    let hostW = 1;
    let hostH = 1;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      hostW = Math.max(1, Math.floor(rect.width));
      hostH = Math.max(1, Math.floor(rect.height));
    };
    measure();

    const dprCap = QUALITY_PRESETS[level].maxDpr;
    const widthScale = QUALITY_PRESETS[level].widthScale;

    const resize = () => {
      const relScale = QUALITY_PRESETS[level].resScale / QUALITY_PRESETS.ultra.resScale;
      const rawDpr =
        Math.min(window.devicePixelRatio || 1, dprCap) *
        relScale *
        (tier === "mobile" ? 0.92 : 1);
      const pw = Math.floor(hostW * rawDpr);
      const ph = Math.floor(hostH * rawDpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      return { aspect: hostW / hostH };
    };

    const onPointerMove = (e: PointerEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const finePointer = window.matchMedia("(pointer: fine)").matches && tier !== "mobile";
    if (!reduced && finePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
      },
      { rootMargin: "120px" },
    );
    io.observe(host);

    const render = () => {
      const { aspect } = resize();

      perspectiveInto(PROJ_M, 0.72, aspect, 0.05, 12);
      const yaw = curX * 0.055 + Math.sin(simT * 0.043) * 0.024;
      const pitch = curY * 0.035 + Math.sin(simT * 0.031) * 0.016;
      viewMatrixInto(VIEW_M, yaw, pitch, 2.35);
      multiplyInto(VP_M, PROJ_M, VIEW_M);
      const vp = VP_M;

      const cyr = Math.cos(yaw);
      const syr = Math.sin(yaw);
      const cxr = Math.cos(pitch);
      const sxr = Math.sin(pitch);
      RIGHT[0] = cyr; RIGHT[1] = 0; RIGHT[2] = -syr;
      UP[0] = syr * sxr; UP[1] = cxr; UP[2] = cyr * sxr;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const pulseCount = director.fillPulseUniforms(pulseSrcData, pulseRData, pulseIData);
      const disCount = director.fillDissolveUniforms(disCData, disRData, disSData);

      actData.fill(0);
      director.act.forEach((v, i) => {
        if (i < MAX_NEURONS) actData[i] = v;
      });

      const setShared = (b: ProgramBundle) => {
        gl.uniformMatrix4fv(b.uniforms.uVP, false, vp);
        gl.uniform1f(b.uniforms.uTime, simT);
        gl.uniform1fv(b.uniforms.uAct, actData);
        gl.uniform1i(b.uniforms.uPulseCount, pulseCount);
        gl.uniform3fv(b.uniforms.uPulseSrc, pulseSrcData);
        gl.uniform1fv(b.uniforms.uPulseR, pulseRData);
        gl.uniform1fv(b.uniforms.uPulseI, pulseIData);
        gl.uniform1i(b.uniforms.uDisCount, disCount);
        gl.uniform3fv(b.uniforms.uDisC, disCData);
        gl.uniform1fv(b.uniforms.uDisR, disRData);
        gl.uniform1fv(b.uniforms.uDisS, disSData);
      };

      const resW = canvas.width;
      const resH = canvas.height;

      gl.useProgram(lineB.program);
      setShared(lineB);
      gl.uniformMatrix4fv(lineB.uniforms.uModel, false, IDENTITY);
      gl.uniform2f(lineB.uniforms.uRes, resW, resH);
      gl.uniform1f(lineB.uniforms.uWidthScale, widthScale);
      gl.bindVertexArray(lineVao[0]);
      gl.drawElements(gl.TRIANGLES, network.segs.length * 6, gl.UNSIGNED_INT, 0);

      gl.useProgram(somaB.program);
      setShared(somaB);
      gl.uniformMatrix4fv(somaB.uniforms.uModel, false, IDENTITY);
      gl.uniform3f(somaB.uniforms.uRight, RIGHT[0], RIGHT[1], RIGHT[2]);
      gl.uniform3f(somaB.uniforms.uUp, UP[0], UP[1], UP[2]);
      gl.bindVertexArray(somaVaoPair[0]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, somaInstances);

      gl.useProgram(partB.program);
      setShared(partB);
      gl.uniformMatrix4fv(partB.uniforms.uModel, false, IDENTITY);
      gl.uniform2f(partB.uniforms.uRes, resW, resH);

      // cellular fragments
      gl.uniform1f(partB.uniforms.uAmbient, 0);
      gl.bindVertexArray(partVao[0]);
      gl.drawArrays(gl.POINTS, 0, neuralCount);

      // ambient depth motes (skipped at low quality)
      if (level !== "low" && !reduced) {
        gl.uniform1f(partB.uniforms.uAmbient, 1);
        gl.drawArrays(gl.POINTS, neuralCount, ambientCount);
      }

      // energy vesicles riding fibers (spec §10)
      if (level !== "low") {
        const tc = director.fillTravelerUniforms(travelerPos, travelerDim, travelerSize, simT);
        if (tc > 0) {
          for (let i = 0; i < tc; i++) {
            const o = i * 7;
            travelerData[o] = travelerPos[i * 3];
            travelerData[o + 1] = travelerPos[i * 3 + 1];
            travelerData[o + 2] = travelerPos[i * 3 + 2];
            travelerData[o + 3] = travelerSize[i];
            travelerData[o + 6] = travelerDim[i];
          }
          gl.bindVertexArray(travelerVaoPair[0]);
          gl.bindBuffer(gl.ARRAY_BUFFER, travelerVaoPair[1]);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, travelerData, 0, tc * 7);
          gl.drawArrays(gl.POINTS, 0, tc);
        }
      }

      gl.bindVertexArray(null);
    };

    let emaFrameMs = 8;
    let framesSinceEval = 0;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      const rawDt = now - lastNow;
      const dt = Math.min(rawDt / 1000, 0.05);
      lastNow = now;
      if (!running || disposed || document.hidden || !inView) return;

      simT += dt;
      curX += (mouseX - curX) * 0.045;
      curY += (mouseY - curY) * 0.045;
      director.update(simT, dt);
      render();

      if (perf) {
        emaFrameMs = emaFrameMs * 0.92 + Math.min(rawDt, 50) * 0.08;
        if (++framesSinceEval >= 45) {
          framesSinceEval = 0;
          const next = perf.report(emaFrameMs);
          if (next && next !== level) {
            level = next;
            if (IS_DEV) console.info(`[NeuralScene] adaptive quality → ${level} (ema ${emaFrameMs.toFixed(1)}ms)`);
          }
        }
      }
    };

    const ro = new ResizeObserver(() => {
      measure();
      if (reduced) render();
    });
    ro.observe(host);

    if (reduced) {
      simT = 30;
      render();
      if (IS_DEV) {
        console.info(`[NeuralScene] static · init ${(performance.now() - tInitStart).toFixed(1)}ms · neurons ${network.neurons.length}`);
      }
      return () => {
        ro.disconnect();
        io.disconnect();
        disposed = true;
        cancelAnimationFrame(rafId);
        const ext0 = gl.getExtension("WEBGL_lose_context");
        ext0?.loseContext();
        canvas.remove();
      };
    }

    const onVis = () => {
      lastNow = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    rafId = requestAnimationFrame((now) => {
      lastNow = now;
      running = true;
    });
    rafId = requestAnimationFrame(frame);

    const initMs = performance.now() - tInitStart;
    console.info(
      `[NeuralScene] tier:${tier} quality:${level} neurons:${network.neurons.length} ` +
      `fibers:${network.segs.length} particles:${totalCount}(+${ambientCount} ambient) paths:${network.paths.length} ` +
      `dprCap:${dprCap} · gen:${genMs.toFixed(1)}ms compile:${compileMs.toFixed(1)}ms init:${initMs.toFixed(1)}ms`,
    );
    if (IS_DEV) {
      (window as unknown as Record<string, unknown>).__NEURAL_DEBUG = {
        tier, level: () => level, ema: () => emaFrameMs,
        neurons: network.neurons.length, segs: network.segs.length,
        particles: totalCount, initMs,
      };
    }

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (finePointer && !reduced) window.removeEventListener("pointermove", onPointerMove);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      canvas.remove();
      if (IS_DEV) delete (window as unknown as Record<string, unknown>).__NEURAL_DEBUG;
    };
    }
  }, [fallback]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {fallback ? <NeuralFallback /> : <div ref={hostRef} className="absolute inset-0" />}
    </div>
  );
}
