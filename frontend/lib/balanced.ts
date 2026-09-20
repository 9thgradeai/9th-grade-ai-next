// Balanced distribution utilities — whole-subject even sampling
// Used by Practice, RealExam, and any exam mode.

export function allocateEvenly(total: number, capacities: number[]): number[] {
  const n = capacities.length;
  if (n === 0 || total <= 0) return capacities.map(() => 0);
  const alloc = new Array(n).fill(0);
  let remaining = total;
  let eligible = capacities.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);

  while (remaining > 0 && eligible.length > 0) {
    const perLeaf = Math.floor(remaining / eligible.length);
    const extra = remaining % eligible.length;
    let distributed = 0;
    // Distribute base + remainder as evenly as possible this round
    for (let idx = 0; idx < eligible.length; idx++) {
      const i = eligible[idx];
      const need = perLeaf + (idx < extra ? 1 : 0);
      if (need <= 0) continue;
      const canGive = Math.min(need, capacities[i] - alloc[i]);
      alloc[i] += canGive;
      distributed += canGive;
    }
    if (distributed === 0) break;
    remaining -= distributed;
    eligible = eligible.filter((i) => alloc[i] < capacities[i]);
  }
  return alloc;
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Balanced sample: group items by key, allocate evenly, shuffle within groups then slice
export function balancedSample<T>(items: T[], getKey: (item: T) => string, requested: number): T[] {
  if (requested <= 0 || items.length === 0) return [];
  if (requested >= items.length) return shuffle(items);
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = getKey(item);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(item);
  }
  const keys = [...groups.keys()];
  const capacities = keys.map((k) => groups.get(k)!.length);
  const alloc = allocateEvenly(requested, capacities);
  const picked: T[] = [];
  for (let i = 0; i < keys.length; i++) {
    const pool = shuffle(groups.get(keys[i])!);
    picked.push(...pool.slice(0, alloc[i]));
  }
  // Shuffle final set so topics intermix
  return shuffle(picked);
}
