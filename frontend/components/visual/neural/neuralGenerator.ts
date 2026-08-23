import { gauss, mulberry32, randUnit, range, type Rng } from "./seededRandom";
import { ACTIVATION, type ResolvedNeuralConfig } from "./config";

export type SceneTier = "mobile" | "tablet" | "desktop";

export const MAX_NEURONS = 256;

export interface Neuron {
  pos: [number, number, number];
  size: number;
  seed: number;
  layer: 0 | 1 | 2;
  birth: number;
  dim: number;
}

export interface LineSeg {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  width: number;
  id: number;
  dim: number;
  birth: number;
  seed: number;
}

export interface AmbientMote {
  pos: [number, number, number];
  size: number;
  seed: number;
  amp: number;
  dim: number;
}

export interface ConnectionPath {
  ia: number;
  ib: number;
  mid: [number, number, number];
}

export interface Network {
  neurons: Neuron[];
  segs: LineSeg[];
  neighbors: number[][];
  hubIndex: number;
  particles: {
    pos: [number, number, number];
    size: number;
    seed: number;
    amp: number;
    dim: number;
  }[];
  /** depth-only environmental motes (spec §13) */
  ambient: AmbientMote[];
  /** quadratic-bezier control points for energy travelers (spec §10) */
  paths: ConnectionPath[];
  pathLookup: Map<string, number>;
}

export function generateNetwork(cfg: ResolvedNeuralConfig, seed = 20260823): Network {
  const rng = mulberry32(seed);
  const { preset, geometry } = cfg;
  const neurons: Neuron[] = [];

  // Content-safe zone (spec §4): structures never extend further left than
  // center − spread·safeFrac; violators mirror to the right side.
  const minXFracByTier: Record<SceneTier, number> = { desktop: 0.38, tablet: 0.3, mobile: 1 };
  const minX = geometry.centerX - geometry.spreadX * minXFracByTier[cfg.tier];

  const spawn = (layer: 0 | 1 | 2, count: number) => {
    for (let i = 0; i < count; i++) {
      const size =
        layer === 0
          ? range(rng, 0.03, 0.052)
          : layer === 1
            ? range(rng, 0.011, 0.023)
            : range(rng, 0.006, 0.012);
      const depthBias = layer === 2 ? 1.25 : layer === 0 ? 0.55 : 1;
      let nx =
        geometry.centerX + gauss(rng) * geometry.spreadX * 0.52 * depthBias;
      if (nx < minX && layer !== 2) nx = 2 * geometry.centerX - nx;
      const ny =
        geometry.centerY + gauss(rng) * geometry.spreadY * 0.48 * depthBias;
      neurons.push({
        pos: [nx, ny, gauss(rng) * geometry.spreadZ * 0.45 * depthBias],
        size,
        seed: range(rng, 0.01, 0.99),
        layer,
        birth:
          layer === 0
            ? range(rng, 2.1, 4.1)
            : 1.0 + Math.pow(rng(), 1.35) * 2.7,
        dim: layer === 0 ? 0.42 : layer === 2 ? 0.5 : range(rng, 0.75, 1),
      });
    }
  };

  spawn(2, preset.bg);
  spawn(1, preset.mg);
  spawn(0, preset.fg);

  const segs: LineSeg[] = [];
  const pushSeg = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    width: number, id: number, dim: number, birth: number, seed: number,
  ) => {
    segs.push({ ax, ay, az, bx, by, bz, width, id, dim, birth, seed });
  };

  neurons.forEach((n, idx) => {
    const radial: [number, number, number] = [
      n.pos[0] - geometry.centerX,
      n.pos[1] - geometry.centerY,
      n.pos[2],
    ];
    const rl = Math.hypot(radial[0], radial[1], radial[2]) || 1;
    const primaryCount = n.layer === 1 ? Math.floor(range(rng, 3, 6.99)) : Math.floor(range(rng, 2, 4.99));
    const baseWidth = n.layer === 0 ? 2.6 : n.layer === 1 ? 1.7 : 1.2;

    for (let p = 0; p < primaryCount; p++) {
      const ru = randUnit(rng);
      let dir: [number, number, number] = [
        ru[0] * 0.42 + (radial[0] / rl) * 0.58,
        ru[1] * 0.42 + (radial[1] / rl) * 0.58,
        ru[2] * 0.42 + (radial[2] / rl) * 0.58,
      ];
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
      growBranch(
        rng, n, idx, dir,
        n.layer === 0 ? range(rng, 0.09, 0.16) : range(rng, 0.05, 0.13),
        baseWidth, 0, 0,
      );
    }

    function growBranch(
      r: Rng,
      neuron: Neuron,
      neuronIdx: number,
      startDir: [number, number, number],
      length: number,
      width: number,
      t0: number,
      depth: number,
    ) {
      const steps = depth === 0 ? 6 : 4;
      const stepLen = length / steps;
      let px = neuron.pos[0];
      let py = neuron.pos[1];
      let pz = neuron.pos[2];
      let dx = startDir[0];
      let dy = startDir[1];
      let dz = startDir[2];
      const curl = depth === 0 ? 0.22 : 0.34;

      for (let s = 0; s < steps; s++) {
        const jitter = randUnit(r);
        dx += jitter[0] * curl;
        dy += jitter[1] * curl;
        dz += jitter[2] * curl;
        const dl2 = Math.hypot(dx, dy, dz) || 1;
        dx /= dl2;
        dy /= dl2;
        dz /= dl2;

        const nx = px + dx * stepLen;
        const ny = py + dy * stepLen;
        const nz = pz + dz * stepLen;
        const taper = width * (1 - 0.55 * ((t0 + s / steps) / 1));
        pushSeg(px, py, pz, nx, ny, nz, taper, neuronIdx, neuron.dim, neuron.birth, neuron.seed);

        if (depth < 2 && s >= 1 && r() < 0.42) {
          const jd = randUnit(r);
          growBranch(
            r, neuron, neuronIdx,
            [dx + jd[0] * 0.9, dy + jd[1] * 0.9, dz + jd[2] * 0.9],
            length * 0.42,
            taper * 0.65,
            t0 + s / steps,
            depth + 1,
          );
        }
        px = nx;
        py = ny;
        pz = nz;
      }
    }
  });

  const neighbors: number[][] = neurons.map(() => []);
  const connected = new Set<string>();
  const cell = 0.14;
  const grid = new Map<string, number[]>();
  neurons.forEach((n, i) => {
    if (n.layer === 0) return;
    const key = `${Math.floor((n.pos[0] + 4) / cell)},${Math.floor((n.pos[1] + 4) / cell)},${Math.floor((n.pos[2] + 4) / cell)}`;
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  });

  let connectionCount = 0;
  const MAX_CONNECTIONS = 420;
  const paths: ConnectionPath[] = [];
  const pathLookup = new Map<string, number>();

  for (const [key, list] of grid) {
    if (connectionCount >= MAX_CONNECTIONS) break;
    const [cxStr, cyStr, czStr] = key.split(",").map(Number);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const other = grid.get(`${cxStr + ox},${cyStr + oy},${czStr + oz}`);
          if (!other) continue;
          for (const i of list) {
            for (const j of other) {
              if (i >= j) continue;
              if (connectionCount >= MAX_CONNECTIONS) break;
              if (neighbors[i].length >= preset.maxConn && neighbors[j].length >= preset.maxConn) continue;
              const pairKey = `${i}:${j}`;
              if (connected.has(pairKey)) continue;
              const a = neurons[i].pos;
              const b = neurons[j].pos;
              const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
              if (d > preset.connDist) continue;
              connected.add(pairKey);
              neighbors[i].push(j);
              neighbors[j].push(i);
              connectionCount++;
              addCurvedFiber(a, b, d, i, j);
            }
          }
        }
      }
    }
  }

  function addCurvedFiber(
    a: [number, number, number],
    b: [number, number, number],
    dist: number,
    ia: number,
    ib: number,
  ) {
    const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const perp: [number, number, number] = [-b[1] + a[1], b[0] - a[0], range(rng, -0.02, 0.02)];
    const pl = Math.hypot(perp[0], perp[1], perp[2]) || 1;
    const bend = range(rng, 0.15, 0.5) * dist;
    mid[0] += (perp[0] / pl) * bend;
    mid[1] += (perp[1] / pl) * bend;
    mid[2] += (perp[2] / pl) * bend;

    // record path for energy travelers (spec §10)
    if (paths.length < ACTIVATION.maxConnectionPaths) {
      pathLookup.set(`${Math.min(ia, ib)}:${Math.max(ia, ib)}`, paths.length);
      paths.push({ ia, ib, mid });
    }

    const owner = rng() < 0.5 ? ia : ib;
    const dim = Math.min(neurons[ia].dim, neurons[ib].dim) * 0.85;
    const birth = Math.max(neurons[ia].birth, neurons[ib].birth) + 0.3;
    const width = range(rng, 0.9, 1.5);
    const SAMPLES = 7;
    const bez = (u: number): [number, number, number] => {
      const v = 1 - u;
      return [
        v * v * a[0] + 2 * v * u * mid[0] + u * u * b[0],
        v * v * a[1] + 2 * v * u * mid[1] + u * u * b[1],
        v * v * a[2] + 2 * v * u * mid[2] + u * u * b[2],
      ];
    };
    let prev = bez(0);
    for (let sIdx = 1; sIdx <= SAMPLES; sIdx++) {
      const cur = bez(sIdx / SAMPLES);
      pushSeg(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], width, owner, dim, birth, neurons[owner].seed);
      prev = cur;
    }
  }

  let hubIndex = 0;
  let bestScore = -Infinity;
  neurons.forEach((n, i) => {
    if (n.layer !== 1 || n.birth > 3.4) return;
    const score = neighbors[i].length * 10 - n.birth;
    if (score > bestScore) {
      bestScore = score;
      hubIndex = i;
    }
  });

  const particles: Network["particles"] = [];
  for (let i = 0; i < preset.particles; i++) {
    const host = neurons[Math.floor(rng() * neurons.length)];
    const off = randUnit(rng);
    const rad = range(rng, host.size * 1.4, host.size * 3.4 + 0.055);
    particles.push({
      pos: [host.pos[0] + off[0] * rad, host.pos[1] + off[1] * rad, host.pos[2] + off[2] * rad],
      size: range(rng, 1.5, 3.8),
      seed: rng(),
      amp: range(rng, 0.002, 0.006),
      dim: host.dim * range(rng, 0.45, 1),
    });
  }

  // Ambient motes (spec §13): sparse, dim, slow — pure depth cue.
  const ambient: AmbientMote[] = [];
  for (let i = 0; i < preset.ambient; i++) {
    const host = neurons[Math.floor(rng() * neurons.length)];
    const off = randUnit(rng);
    const rad = range(rng, 0.12, 0.34);
    ambient.push({
      pos: [host.pos[0] + off[0] * rad, host.pos[1] + off[1] * rad, host.pos[2] + off[2] * rad],
      size: range(rng, 1.1, 2.4),
      seed: rng(),
      amp: range(rng, 0.004, 0.011),
      dim: range(rng, 0.14, 0.34),
    });
  }

  return { neurons, segs, neighbors, hubIndex, particles, ambient, paths, pathLookup };
}
