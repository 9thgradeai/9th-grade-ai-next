export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (r: Rng, a: number, b: number): number => a + (b - a) * r();

export const gauss = (r: Rng): number => (r() + r() + r() - 1.5) / 1.5;

export function randUnit(r: Rng): [number, number, number] {
  const z = range(r, -1, 1);
  const t = range(r, 0, Math.PI * 2);
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(t), s * Math.sin(t), z];
}
