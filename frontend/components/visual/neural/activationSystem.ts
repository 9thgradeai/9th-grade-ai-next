import { mulberry32, type Rng } from "./seededRandom";
import type { Network } from "./neuralGenerator";

interface ScheduledFire {
  t: number;
  id: number;
  strength: number;
  hops: number;
}

const MAX_PULSES = 6;
const MAX_DISSOLVES = 4;
const CONDUCTION_SPEED = 0.24;
const ACT_DECAY_TAU = 1.7;
const INTRO_GLOW_START = 3.1;
const INTRO_FIRE_AT = 3.95;
const DIRECTOR_START = 6.4;

export class ActivationDirector {
  readonly act: Float32Array;
  private scheduled: ScheduledFire[] = [];
  private dueBuf: ScheduledFire[] = [];
  private cooldownUntil: Float32Array;
  private pulses: { src: [number, number, number]; r: number; start: number; speed: number; life: number; strength: number }[] = [];
  private dissolves: {
    c: [number, number, number];
    radius: number;
    start: number;
    attack: number;
    hold: number;
    release: number;
    cascaded: boolean;
  }[] = [];
  private nextEventAt = DIRECTOR_START;
  private lastRegionSeedPos: [number, number, number] = [999, 999, 999];
  private introDone = false;
  private simT = 0;
  private rng: Rng;

  constructor(
    private network: Network,
    private staticMode: boolean,
    seed = 771,
  ) {
    this.rng = mulberry32(seed);
    const n = network.neurons.length;
    this.act = new Float32Array(n);
    this.cooldownUntil = new Float32Array(n);

    if (staticMode) {
      this.act[network.hubIndex] = 0.5;
      for (const nb of network.neighbors[network.hubIndex]) this.act[nb] = 0.3;
      for (let i = 0; i < n; i += 11) this.act[i] = Math.max(this.act[i], 0.14);
    }
  }

  update(t: number, dt: number): void {
    if (this.staticMode) return;
    this.simT = t;

    if (!this.introDone) {
      if (t >= INTRO_GLOW_START && t < INTRO_FIRE_AT) {
        const glow = smoothstep(INTRO_GLOW_START, INTRO_FIRE_AT, t);
        this.act[this.network.hubIndex] = Math.max(this.act[this.network.hubIndex], glow * 0.8);
      }
      if (t >= INTRO_FIRE_AT) {
        this.introDone = true;
        this.fire(this.network.hubIndex, t, 1.0, 3);
      }
    }

    const decay = Math.exp(-dt / ACT_DECAY_TAU);
    for (let i = 0; i < this.act.length; i++) this.act[i] *= decay;

    let w = 0;
    let ndue = 0;
    for (let i = 0; i < this.scheduled.length; i++) {
      const f = this.scheduled[i];
      if (f.t <= t) this.dueBuf[ndue++] = f;
      else this.scheduled[w++] = f;
    }
    this.scheduled.length = w;
    for (let k = 0; k < ndue; k++) {
      const f = this.dueBuf[k];
      if (t < this.cooldownUntil[f.id]) continue;
      this.fire(f.id, t, f.strength, f.hops);
    }

    w = 0;
    for (let i = 0; i < this.pulses.length; i++) {
      const p = this.pulses[i];
      const age = t - p.start;
      p.r = age * p.speed;
      if (age < p.life) this.pulses[w++] = p;
    }
    this.pulses.length = w;

    w = 0;
    for (let i = 0; i < this.dissolves.length; i++) {
      const d = this.dissolves[i];
      const age = t - d.start;
      if (!d.cascaded && age > d.attack + d.hold + d.release * 0.35) {
        d.cascaded = true;
        const anchor = this.nearestNeuron(d.c);
        if (anchor >= 0) this.fire(anchor, t, 0.92, 3);
      }
      if (age < d.attack + d.hold + d.release) this.dissolves[w++] = d;
    }
    this.dissolves.length = w;

    if (this.introDone && t >= this.nextEventAt) {
      this.scheduleEvent(t);
      this.nextEventAt = t + 4 + this.rng() * 4;
    }
  }

  fillPulseUniforms(srcArr: Float32Array, rArr: Float32Array, iArr: Float32Array): number {
    const count = Math.min(this.pulses.length, MAX_PULSES);
    for (let i = 0; i < count; i++) {
      const p = this.pulses[i];
      srcArr[i * 3] = p.src[0];
      srcArr[i * 3 + 1] = p.src[1];
      srcArr[i * 3 + 2] = p.src[2];
      rArr[i] = p.r;
      iArr[i] = p.strength * Math.max(0, 1 - (this.simT - p.start) / p.life) ** 1.4;
    }
    srcArr.fill(0, count * 3);
    rArr.fill(-10, count);
    iArr.fill(0, count);
    return count;
  }

  fillDissolveUniforms(cArr: Float32Array, rArr: Float32Array, sArr: Float32Array): number {
    const count = Math.min(this.dissolves.length, MAX_DISSOLVES);
    for (let i = 0; i < count; i++) {
      const d = this.dissolves[i];
      cArr[i * 3] = d.c[0];
      cArr[i * 3 + 1] = d.c[1];
      cArr[i * 3 + 2] = d.c[2];
      rArr[i] = d.radius;
      const age = this.simT - d.start;
      let s: number;
      if (age < d.attack) s = smoothstep(0, d.attack, age);
      else if (age < d.attack + d.hold) s = 1;
      else s = 1 - smoothstep(d.attack + d.hold, d.attack + d.hold + d.release, age);
      sArr[i] = s;
    }
    cArr.fill(0, count * 3);
    rArr.fill(0, count);
    sArr.fill(0, count);
    return count;
  }

  private fire(id: number, t: number, strength: number, hops: number): void {
    if (strength < 0.22) return;
    this.act[id] = Math.min(1.2, Math.max(this.act[id], strength));
    this.cooldownUntil[id] = t + 1.15 + this.rng() * 0.7;
    const pos = this.network.neurons[id].pos;

    if (hops > 0) {
      for (const nb of this.network.neighbors[id]) {
        const np = this.network.neurons[nb].pos;
        const d = Math.hypot(pos[0] - np[0], pos[1] - np[1], pos[2] - np[2]);
        this.scheduled.push({
          t: t + d / CONDUCTION_SPEED * 0.5 + this.rng() * 0.14,
          id: nb,
          strength: strength * (0.72 + this.rng() * 0.18),
          hops: hops - 1,
        });
      }
    }

    if (this.pulses.length >= MAX_PULSES) {
      let oldest = 0;
      for (let i = 1; i < this.pulses.length; i++) {
        if (this.pulses[i].start < this.pulses[oldest].start) oldest = i;
      }
      this.pulses.splice(oldest, 1);
    }
    this.pulses.push({
      src: [pos[0], pos[1], pos[2]],
      r: 0,
      start: t,
      speed: CONDUCTION_SPEED * 1.35,
      life: 1.7,
      strength,
    });
  }

  private scheduleEvent(t: number): void {
    const neurons = this.network.neurons;
    let candidate = -1;
    let bestDist = -1;
    for (let tries = 0; tries < 8; tries++) {
      const c = Math.floor(this.rng() * neurons.length);
      const p = neurons[c].pos;
      const d = Math.hypot(p[0] - this.lastRegionSeedPos[0], p[1] - this.lastRegionSeedPos[1]);
      if (d > bestDist) {
        bestDist = d;
        candidate = c;
      }
    }
    if (candidate < 0) return;
    const pos = neurons[candidate].pos;
    this.lastRegionSeedPos = [pos[0], pos[1], pos[2]];

    if (this.rng() < 0.56 && this.dissolves.length < MAX_DISSOLVES) {
      this.dissolves.push({
        c: [pos[0], pos[1], pos[2]],
        radius: 0.11 + this.rng() * 0.075,
        start: t,
        attack: 1.4 + this.rng() * 0.8,
        hold: 0.9 + this.rng() * 0.7,
        release: 2.4 + this.rng() * 1.2,
        cascaded: false,
      });
    } else {
      this.fire(candidate, t, 0.95 + this.rng() * 0.25, 3 + Math.floor(this.rng() * 2));
    }
  }

  private nearestNeuron(c: [number, number, number]): number {
    let best = -1;
    let bd = Infinity;
    this.network.neurons.forEach((n, i) => {
      const d = Math.hypot(n.pos[0] - c[0], n.pos[1] - c[1], n.pos[2] - c[2]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
