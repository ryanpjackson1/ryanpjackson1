/**
 * Poisson-disk selection of an EXACT count of points from a dense,
 * non-uniform candidate set (the baked surface). Dart throwing over the
 * candidates in shuffled order gives blue noise — no clumps, no holes.
 * The radius is solved from a trial pass (random sequential adsorption
 * packs to M ≈ 0.70·A/r²), refined, and the last few accepted points are
 * trimmed to hit the count exactly. Chunked so it never stalls a frame.
 */
const RSA = 0.7;

export interface Selection { idx: Uint32Array; radius: number; area: number }

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Yield = () => Promise<void>;
const defaultYield: Yield = () =>
  typeof requestAnimationFrame === "function"
    ? new Promise((r) => requestAnimationFrame(() => r()))
    : Promise.resolve();

async function dart(pos: Float32Array, order: Uint32Array, r: number, limit: number, yieldFn: Yield): Promise<Uint32Array> {
  const cell = r / Math.sqrt(3);
  const inv = 1 / cell;
  const grid = new Map<number, number>(); // cell key → candidate index
  const key = (x: number, y: number, z: number) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
  const out = new Uint32Array(Math.min(order.length, limit));
  let n = 0;
  const r2 = r * r;
  for (let k = 0; k < order.length && n < limit; k++) {
    const i = order[k];
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++)
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dz = -2; dz <= 2 && ok; dz++) {
          const j = grid.get(key(cx + dx, cy + dy, cz + dz));
          if (j === undefined) continue;
          const ex = pos[j * 3] - x, ey = pos[j * 3 + 1] - y, ez = pos[j * 3 + 2] - z;
          if (ex * ex + ey * ey + ez * ez < r2) ok = false;
        }
    if (ok) {
      grid.set(key(cx, cy, cz), i);
      out[n++] = i;
    }
    if ((k & 8191) === 8191) await yieldFn();
  }
  return out.subarray(0, n);
}

export async function poissonSelect(
  pos: Float32Array,
  count: number,
  target: number,
  opts: { seed?: number; yieldFn?: Yield; filter?: (i: number) => boolean } = {},
): Promise<Selection> {
  const yieldFn = opts.yieldFn ?? defaultYield;
  const rnd = mulberry32(opts.seed ?? 1337);
  // shuffled candidate order (Fisher–Yates), with optional filter
  const pool: number[] = [];
  for (let i = 0; i < count; i++) if (!opts.filter || opts.filter(i)) pool.push(i);
  const order = Uint32Array.from(pool);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  // trial pass with a small radius to measure the area
  let r = 0.004;
  let sel = await dart(pos, order, r, Infinity, yieldFn);
  let area = (sel.length * r * r) / RSA;
  // solve for the radius that yields slightly more than target, refine twice
  for (let it = 0; it < 3; it++) {
    r = Math.sqrt((RSA * area) / (target * 1.004));
    sel = await dart(pos, order, r, Infinity, yieldFn);
    area = (sel.length * r * r) / RSA;
    if (sel.length >= target && sel.length < target * 1.012) break;
  }
  if (sel.length < target) {
    // relax until we have enough
    while (sel.length < target && r > 1e-4) {
      r *= 0.985;
      sel = await dart(pos, order, r, Infinity, yieldFn);
    }
  }
  // exact count: the trimmed points are the LAST accepted, i.e. random places
  return { idx: sel.slice(0, target), radius: r, area };
}
