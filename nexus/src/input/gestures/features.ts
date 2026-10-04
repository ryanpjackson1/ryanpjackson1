/** Per-frame hand features from MediaPipe's 21 landmarks (normalised image coords). */
export interface Landmark { x: number; y: number; z?: number }

export interface HandFeatures {
  /** Palm centre in NDC (-1..1), mirrored so moving right moves right. */
  x: number;
  y: number;
  /** Index fingertip in NDC — the hand pointer. */
  px: number;
  py: number;
  /** Thumb-tip ↔ index-tip distance divided by palm size (scale-free). */
  pinch: number;
}

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
const ndc = (p: { x: number; y: number }) => ({ x: 1 - 2 * p.x, y: 1 - 2 * p.y });

export function extractFeatures(lm: Landmark[]): HandFeatures | null {
  if (lm.length < 21) return null;
  const palmIdx = [0, 5, 9, 13, 17];
  const palm = palmIdx.reduce((s, i) => ({ x: s.x + lm[i].x / 5, y: s.y + lm[i].y / 5 }), { x: 0, y: 0 });
  const size = Math.max(1e-4, dist(lm[0], lm[9]));
  const p = ndc(palm);
  const tip = ndc(lm[8]);
  return { x: p.x, y: p.y, px: tip.x, py: tip.y, pinch: dist(lm[4], lm[8]) / size };
}
