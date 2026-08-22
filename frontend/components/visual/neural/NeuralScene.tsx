import { useEffect, useRef } from "react";
import { ActivationDirector } from "./activationSystem";
import {
  generateNetwork,
  MAX_NEURONS,
  type Network,
  type SceneTier,
} from "./neuralGenerator";
import { LINE_FS, LINE_VS, PARTICLE_FS, PARTICLE_VS, SOMA_FS, SOMA_VS } from "./shaders";

interface TierRuntime {
  dpr: number;
  widthScale: number;
  globalAlpha: number;
}

const TIER_RUNTIME: Record<SceneTier, TierRuntime> = {
  desktop: { dpr: 1.75, widthScale: 1, globalAlpha: 1 },
  tablet: { dpr: 1.4, widthScale: 0.85, globalAlpha: 0.95 },
  mobile: { dpr: 1.25, widthScale: 0.7, globalAlpha: 0.8 },
};

function detectTier(): SceneTier {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (window.innerWidth < 768) return "mobile";
  if (coarse || window.innerWidth < 1180) return "tablet";
  return "desktop";
}

type Mat4 = Float32Array;

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function viewMatrix(yaw: number, pitch: number, camZ: number): Mat4 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const r00 = cy, r01 = 0, r02 = -sy;
  const r10 = sy * sx, r11 = cx, r12 = cy * sx;
  const r20 = sy * cx, r21 = -sx, r22 = cy * cx;
  const eye: [number, number, number] = [0, 0, camZ];
  const out = new Float32Array(16);
  out[0] = r00; out[4] = r01; out[8] = r02;
  out[1] = r10; out[5] = r11; out[9] = r12;
  out[2] = r20; out[6] = r21; out[10] = r22;
  out[12] = -(r00 * eye[0] + r01 * eye[1] + r02 * eye[2]);
  out[13] = -(r10 * eye[0] + r11 * eye[1] + r12 * eye[2]);
  out[14] = -(r20 * eye[0] + r21 * eye[1] + r22 * eye[2]);
  out[15] = 1;

  const pivot: [number, number, number] = [0.3, 0.04, 0];
  const t = new Float32Array(16);
  const ti = new Float32Array(16);
  t[0] = 1; t[5] = 1; t[10] = 1; t[15] = 1;
  t[12] = -pivot[0]; t[13] = -pivot[1]; t[14] = -pivot[2];
  ti[0] = 1; ti[5] = 1; ti[10] = 1; ti[15] = 1;
  ti[12] = pivot[0]; ti[13] = pivot[1]; ti[14] = pivot[2];
  return multiply(multiply(ti, out), t);
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function multiplyVec4(m: Mat4, v: [number, number, number, number]): [number, number, number, number] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}

interface ProgramBundle {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export default function NeuralScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      console.warn("[NeuralScene] reduced-motion preference active — rendering static composition");
    }
    let cleanup: (() => void) | undefined;
    try {
      cleanup = init();
    } catch (err) {
      console.warn("[NeuralScene] init crashed", err);
    }
    return cleanup;

    function init(): (() => void) | undefined {
    if (!host) return;
    const tier = detectTier();
    const runtime = TIER_RUNTIME[tier];
    const network: Network = generateNetwork(tier);

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    host.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    if (!gl) {
      console.warn("[NeuralScene] WebGL2 unavailable — CSS atmosphere only");
      canvas.remove();
      return;
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
      "uVP", "uModel", "uRes", "uTime",
      "uAct", "uPulseCount", "uPulseSrc", "uPulseR", "uPulseI",
      "uDisCount", "uDisC", "uDisR", "uDisS",
    ]);

    if (!lineB || !somaB || !partB) {
      canvas.remove();
      return;
    }

    const actData = new Float32Array(MAX_NEURONS);
    const pulseSrcData = new Float32Array(18);
    const pulseRData = new Float32Array(6);
    const pulseIData = new Float32Array(6);
    const disCData = new Float32Array(12);
    const disRData = new Float32Array(4);
    const disSData = new Float32Array(4);

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

    const particleCount = network.particles.length;
    const particleData = new Float32Array(particleCount * 7);
    network.particles.forEach((p, i) => {
      const o = i * 7;
      particleData[o] = p.pos[0];
      particleData[o + 1] = p.pos[1];
      particleData[o + 2] = p.pos[2];
      particleData[o + 3] = p.size;
      particleData[o + 4] = p.seed;
      particleData[o + 5] = p.amp;
      particleData[o + 6] = p.dim;
    });

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
      [8, 3], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],
    ];
    const partLayout: [number, number][] = [[14, 3], [15, 1], [16, 1], [17, 1], [18, 1]];

    const cornerBuf = gl.createBuffer();
    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    const lineVao = makeVao(lineData, lineLayout, lineIndices);
    const somaVaoPair = (() => {
      const vao = gl.createVertexArray();
      if (!vao || !cornerBuf) return null;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(7, 0);
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
      gl.bindVertexArray(null);
      return [vao, vbo] as const;
    })();
    const partVao = makeVao(particleData, partLayout);

    if (!lineVao || !somaVaoPair || !partVao) {
      canvas.remove();
      return;
    }

    const director = new ActivationDirector(network, reduced);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const rawDpr = Math.min(window.devicePixelRatio || 1, runtime.dpr) * (tier === "mobile" ? 0.92 : 1);
      const pw = Math.floor(w * rawDpr);
      const ph = Math.floor(h * rawDpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      return { w, h, aspect: w / h };
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

      const proj = perspective(0.72, aspect, 0.05, 12);
      const view = viewMatrix(curX * 0.055 + Math.sin(simT * 0.043) * 0.024, curY * 0.035 + Math.sin(simT * 0.031) * 0.016, 2.35);
      const vp = multiply(proj, view);

      const rotY = curX * 0.055 + Math.sin(simT * 0.043) * 0.024;
      const rotX = curY * 0.035 + Math.sin(simT * 0.031) * 0.016;
      const cyr = Math.cos(rotY);
      const syr = Math.sin(rotY);
      const cxr = Math.cos(rotX);
      const sxr = Math.sin(rotX);
      const right: [number, number, number] = [cyr, 0, -syr];
      const up: [number, number, number] = [syr * sxr, cxr, cyr * sxr];

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const pulses = director.getPulses();
      const dissolves = director.getDissolves();
      pulseSrcData.fill(0);
      pulseRData.fill(-10);
      pulseIData.fill(0);
      pulses.forEach((p, i) => {
        pulseSrcData[i * 3] = p.src[0];
        pulseSrcData[i * 3 + 1] = p.src[1];
        pulseSrcData[i * 3 + 2] = p.src[2];
        pulseRData[i] = p.r;
        pulseIData[i] = p.intensity;
      });
      disCData.fill(0);
      disRData.fill(0);
      disSData.fill(0);
      dissolves.forEach((d, i) => {
        disCData[i * 3] = d.c[0];
        disCData[i * 3 + 1] = d.c[1];
        disCData[i * 3 + 2] = d.c[2];
        disRData[i] = d.r;
        disSData[i] = d.strength;
      });
      actData.fill(0);
      director.act.forEach((v, i) => {
        if (i < MAX_NEURONS) actData[i] = v;
      });

      const setShared = (b: ProgramBundle) => {
        gl.uniformMatrix4fv(b.uniforms.uVP, false, vp);
        gl.uniform1f(b.uniforms.uTime, simT);
        gl.uniform1fv(b.uniforms.uAct, actData);
        gl.uniform1i(b.uniforms.uPulseCount, pulses.length);
        gl.uniform3fv(b.uniforms.uPulseSrc, pulseSrcData);
        gl.uniform1fv(b.uniforms.uPulseR, pulseRData);
        gl.uniform1fv(b.uniforms.uPulseI, pulseIData);
        gl.uniform1i(b.uniforms.uDisCount, dissolves.length);
        gl.uniform3fv(b.uniforms.uDisC, disCData);
        gl.uniform1fv(b.uniforms.uDisR, disRData);
        gl.uniform1fv(b.uniforms.uDisS, disSData);
      };

      const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const resW = canvas.width;
      const resH = canvas.height;

      gl.useProgram(lineB.program);
      setShared(lineB);
      gl.uniformMatrix4fv(lineB.uniforms.uModel, false, identity);
      gl.uniform2f(lineB.uniforms.uRes, resW, resH);
      gl.uniform1f(lineB.uniforms.uWidthScale, runtime.widthScale);
      gl.bindVertexArray(lineVao[0]);
      gl.drawElements(gl.TRIANGLES, network.segs.length * 6, gl.UNSIGNED_INT, 0);

      gl.useProgram(somaB.program);
      setShared(somaB);
      gl.uniformMatrix4fv(somaB.uniforms.uModel, false, identity);
      gl.uniform3f(somaB.uniforms.uRight, right[0], right[1], right[2]);
      gl.uniform3f(somaB.uniforms.uUp, up[0], up[1], up[2]);
      gl.bindVertexArray(somaVaoPair[0]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, somaInstances);

      gl.useProgram(partB.program);
      setShared(partB);
      gl.uniformMatrix4fv(partB.uniforms.uModel, false, identity);
      gl.uniform2f(partB.uniforms.uRes, resW, resH);
      gl.bindVertexArray(partVao[0]);
      gl.drawArrays(gl.POINTS, 0, particleCount);

      gl.bindVertexArray(null);
    };

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;
      if (!running || disposed || document.hidden || !inView) return;
      simT += dt;
      curX += (mouseX - curX) * 0.045;
      curY += (mouseY - curY) * 0.045;
      director.update(simT, dt);
      render();
    };

    if (reduced) {
      simT = 30;
      render();
      const ro = new ResizeObserver(() => render());
      ro.observe(host);
      console.info(`[NeuralScene] static composition · ${network.neurons.length} neurons`);
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

    console.info(
      `[NeuralScene] tier:${tier} neurons:${network.neurons.length} fibers:${network.segs.length} particles:${particleCount}`,
    );

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(rafId);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (finePointer && !reduced) window.removeEventListener("pointermove", onPointerMove);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      canvas.remove();
    };
    }
  }, []);

  return <div ref={hostRef} className="absolute inset-0 overflow-hidden" />;
}
