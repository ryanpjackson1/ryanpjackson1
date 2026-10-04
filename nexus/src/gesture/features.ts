/**
 * Pure per-frame features from 21 MediaPipe hand landmarks (normalised
 * image coordinates). The image is mirrored so moving your hand right
 * moves the pointer right.
 */
export interface Landmark { x: number; y: number; z: number }

export interface HandFeatures {
  /** Palm centre, NDC. */
  x: number;
  y: number;
  /** Index fingertip, NDC. */
  px: number;
  py: number;
  /** Apparent palm size (wrist → middle MCP), image units. Depth proxy. */
  size: number;
  /** Thumb–index gap / palm size. */
  pinchDist: number;
  /** 0 fist … 1 open palm. */
  openness: number;
  extended: [boolean, boolean, boolean, boolean, boolean]; // thumb index middle ring little
}

const d2 = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
const toNdc = (p: { x: number; y: number }) => ({ x: 1 - 2 * p.x, y: 1 - 2 * p.y });

export function extract(lm: Landmark[]): HandFeatures {
  const ids = [0, 5, 9, 13, 17];
  const palm = ids.reduce((s, i) => ({ x: s.x + lm[i].x / 5, y: s.y + lm[i].y / 5 }), { x: 0, y: 0 });
  const size = Math.max(1e-4, d2(lm[0], lm[9]));
  const ext = (tip: number, pip: number) => d2(lm[tip], lm[0]) > d2(lm[pip], lm[0]) * 1.12;
  const thumb = d2(lm[4], lm[17]) > d2(lm[3], lm[17]) * 1.05 && d2(lm[4], lm[5]) > size * 0.45;
  const extended: HandFeatures["extended"] = [thumb, ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)];
  const openness = extended.filter(Boolean).length / 5;
  const p = toNdc(palm);
  const t = toNdc(lm[8]);
  return { x: p.x, y: p.y, px: t.x, py: t.y, size, pinchDist: d2(lm[4], lm[8]) / size, openness, extended };
}
