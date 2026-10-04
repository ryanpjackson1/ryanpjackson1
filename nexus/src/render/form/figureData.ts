"use client";
import type * as THREE from "three";
import { bakeSurface } from "./bake";
import { poissonSelect } from "./poisson";
import {
  BUST, BUST_BOUNDS, BUST_CUT_Y, BUST_GLSL, HAND_BOUNDS, HAND_CUT_Y,
  assignBone, handFieldGLSL, type V3,
} from "./sdf";
import { smoothstep } from "@/core/motion";

/**
 * Baked figure data per quality tier. Tens of thousands of beads, not
 * hundreds of thousands: at 5 mm spacing the surface merged into plastic.
 * Lower tiers get FEWER, LARGER beads — never gaps (radius follows spacing).
 */
export const BUST_COUNT = [11000, 17000, 24000, 32000] as const;
export const HAND_COUNT = [3200, 4600, 6400, 8400] as const;

export interface PointSet {
  count: number;
  pos: Float32Array;
  nrm: Float32Array;
  /** Bust: (jaw, head, chest) weights. Hand: (bone, materialise seed, 0). */
  region: Float32Array;
  /** Bead radius (m) — ~0.62 of the Poisson spacing so neighbours overlap. */
  bead: number;
}

const cache = new Map<string, Promise<PointSet>>();

async function build(gl: THREE.WebGLRenderer, kind: "bust" | "hand", target: number): Promise<PointSet> {
  const field = kind === "bust" ? BUST_GLSL : handFieldGLSL();
  const bounds = kind === "bust" ? BUST_BOUNDS : HAND_BOUNDS;
  const cand = await bakeSurface(gl, field, bounds, 512, kind === "bust" ? 320 : 192, kind === "bust" ? 11 : 23);
  const cut = kind === "bust" ? BUST_CUT_Y : HAND_CUT_Y + 0.01;
  const sel = await poissonSelect(cand.pos, cand.count, target, {
    seed: kind === "bust" ? 4242 : 777,
    filter: (i) => cand.pos[i * 3 + 1] > cut,
  });
  const n = sel.idx.length;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const region = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = sel.idx[k];
    for (let c = 0; c < 3; c++) {
      pos[k * 3 + c] = cand.pos[i * 3 + c];
      nrm[k * 3 + c] = cand.nrm[i * 3 + c];
    }
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    if (kind === "bust") {
      // jaw: below the mouth line, in front of the ear line, above the neck
      const jaw =
        smoothstep(BUST.mouthY + 0.004, BUST.mouthY - 0.006, y) *
        smoothstep(-0.026, 0.002, y) *
        smoothstep(-0.036, -0.004, z) *
        smoothstep(0.072, 0.05, Math.abs(x));
      const head = smoothstep(-0.085, -0.02, y);
      const chest = smoothstep(-0.12, -0.24, y);
      region[k * 3] = jaw;
      region[k * 3 + 1] = head;
      region[k * 3 + 2] = chest;
    } else {
      region[k * 3] = assignBone([x, y, z] as V3);
      region[k * 3 + 1] = Math.random();
      region[k * 3 + 2] = 0;
    }
  }
  const spacing = Math.sqrt(sel.area / n);
  return { count: n, pos, nrm, region, bead: spacing * 0.64 };
}

export function getFigure(gl: THREE.WebGLRenderer, tier: number): Promise<PointSet> {
  const key = `bust:${tier}`;
  if (!cache.has(key)) cache.set(key, build(gl, "bust", BUST_COUNT[tier] ?? BUST_COUNT[1]));
  return cache.get(key)!;
}

export function getHand(gl: THREE.WebGLRenderer, tier: number): Promise<PointSet> {
  const key = `hand:${tier}`;
  if (!cache.has(key)) cache.set(key, build(gl, "hand", HAND_COUNT[tier] ?? HAND_COUNT[1]));
  return cache.get(key)!;
}
