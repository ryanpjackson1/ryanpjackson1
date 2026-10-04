"use client";
import * as THREE from "three";
import { MODULE_IDS, MODULES, hueToRgb } from "@/core/modules";
import { RING, rt } from "@/core/runtime";
import { ARRIVE } from "@/core/clocks/form";
import { FACE_W, FACE_H } from "@/render/cards/face";
import { cardLeave } from "./schedule";
import type { PointSet } from "./figureData";

/**
 * ONE buffer. At the instant of the command every card face is rasterised
 * exactly as drawn (live data included) and sampled:
 *   type            → small hot fragments
 *   charts / glyphs → accent-coloured streams
 *   the pane        → dim glass
 * Each sample becomes one particle that will become one bead of the
 * figure: three keyframes (card, core, figure) and one float (the form
 * clock) that moves it through them. The return runs the same buffer back.
 */
const SHARE = { cards: 0.76, hud: 0.03 } as const; // the rest is dust

function edge(u: number, v: number) {
  const ex = Math.min(u, 1 - u) * 2 * 1.12;
  const ey = Math.min(v, 1 - v) * 2;
  return Math.max(0, Math.min(1, Math.min(ex, ey)));
}
/** Identical to nxLeave() in the card shader. */
export function leaveAt(u: number, v: number, start: number, span: number) {
  const e = edge(u, v);
  return start + e * e * (3 - 2 * e) * span;
}

interface Src { x: number; y: number; z: number; card: number; r: number; g: number; b: number; leave: number }

function sampleCard(i: number, quota: number, out: Src[]) {
  const canvas = rt.cardCanvases[i];
  const hue = MODULES[MODULE_IDS[i]].hue;
  const [ar, ag, ab] = hueToRgb(hue, 0.85, 0.66);
  const { start, span } = cardLeave[i];
  const push = (u: number, v: number, r: number, g: number, b: number) => {
    out.push({
      x: (u - 0.5) * RING.cardW,
      y: (v - 0.5) * RING.cardH,
      z: 0.006,
      card: i,
      r, g, b,
      leave: leaveAt(u, v, start, span),
    });
  };
  const ink: number[] = []; // packed: px, py, class(0 text / 1 accent), alpha
  const ctx = canvas?.getContext("2d", { willReadFrequently: true });
  if (ctx) {
    const data = ctx.getImageData(0, 0, FACE_W, FACE_H).data;
    for (let py = 0; py < FACE_H; py += 2) {
      for (let px = 0; px < FACE_W; px += 2) {
        const o = (py * FACE_W + px) * 4;
        const a = data[o + 3];
        if (a < 60) continue;
        const r = data[o], g = data[o + 1], b = data[o + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        ink.push(px, py, sat > 70 ? 1 : 0, a / 255);
      }
    }
  }
  const nInk = ink.length / 4;
  const inkQuota = nInk > 0 ? Math.floor(quota * 0.62) : 0;
  for (let k = 0; k < inkQuota; k++) {
    const j = Math.floor(Math.random() * nInk) * 4;
    const u = (ink[j] + Math.random() * 2) / FACE_W;
    const v = 1 - (ink[j + 1] + Math.random() * 2) / FACE_H;
    if (ink[j + 2] === 1) push(u, v, ar * 1.9, ag * 1.9, ab * 1.9);          // accent stream
    else push(u, v, 1.35, 1.5, 1.85);                                      // hot type fragment
  }
  for (let k = inkQuota; k < quota; k++) {
    // the pane: dim glass, uniformly over the rounded rectangle
    const u = 0.02 + Math.random() * 0.96;
    const v = 0.02 + Math.random() * 0.96;
    push(u, v, 0.07 + ar * 0.06, 0.11 + ag * 0.06, 0.24 + ab * 0.06);
  }
}

function sampleHud(n: number, out: Src[]) {
  const cam = rt.camera;
  if (!cam) return;
  // the four HUD corners, unprojected 1.3 m in front of the lens
  const corners = [[-0.82, 0.86], [0.82, 0.86], [0.82, -0.84], [-0.82, -0.84]];
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const c = corners[k % 4];
    v.set(c[0] + (Math.random() - 0.5) * 0.28, c[1] + (Math.random() - 0.5) * 0.14, 0.5).unproject(cam).sub(cam.position).normalize();
    const p = cam.position.clone().addScaledVector(v, 1.3);
    out.push({ x: p.x, y: p.y, z: p.z, card: -1, r: 0.8, g: 0.9, b: 1.25, leave: 0.35 + Math.random() * 0.6 });
  }
}

function sampleDust(n: number, out: Src[]) {
  for (let k = 0; k < n; k++) {
    const a = (Math.random() - 0.5) * Math.PI * 1.6;
    const r = 1.8 + Math.random() * 9;
    out.push({
      x: Math.sin(a) * r, y: -1.6 + Math.random() * 4.2, z: -Math.cos(a) * r,
      card: -1, r: 0.42, g: 0.58, b: 0.95,
      // the dust, shafts and lattice are drawn in AFTER the cards
      leave: 2.0 + Math.random() * 1.15,
    });
  }
}

export function buildJourney(fig: PointSet): THREE.BufferGeometry {
  const N = fig.count;
  const nCards = Math.floor(N * SHARE.cards);
  const nHud = Math.floor(N * SHARE.hud);
  const src: Src[] = [];
  const per = Math.floor(nCards / MODULE_IDS.length);
  MODULE_IDS.forEach((_, i) => sampleCard(i, i === MODULE_IDS.length - 1 ? nCards - per * (MODULE_IDS.length - 1) : per, src));
  sampleHud(nHud, src);
  sampleDust(N - src.length, src);
  // shuffle sources against figure points
  for (let i = src.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [src[i], src[j]] = [src[j], src[i]];
  }

  const aSrc = new Float32Array(N * 4);
  const aCoreOff = new Float32Array(N * 3);
  const aTime = new Float32Array(N * 2);
  const aColor = new Float32Array(N * 3);
  const yTop = 0.25, yBot = -0.44;
  for (let k = 0; k < N; k++) {
    const s = src[k];
    aSrc.set([s.x, s.y, s.z, s.card], k * 4);
    aColor.set([s.r, s.g, s.b], k * 3);
    // uniform point in the unit ball
    let x, y, z;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
    aCoreOff.set([x, y, z], k * 3);
    // crown first, chest last
    const fy = fig.pos[k * 3 + 1];
    const yn = (fy - yBot) / (yTop - yBot);
    const arrive = ARRIVE.start + (1 - yn) * (ARRIVE.span - ARRIVE.travel) + (Math.random() - 0.5) * 0.3;
    aTime.set([s.leave, Math.max(ARRIVE.start, arrive)], k * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(fig.pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(fig.nrm, 3));
  g.setAttribute("aRegion", new THREE.BufferAttribute(fig.region, 3));
  g.setAttribute("aSrc", new THREE.BufferAttribute(aSrc, 4));
  g.setAttribute("aCoreOff", new THREE.BufferAttribute(aCoreOff, 3));
  g.setAttribute("aTime", new THREE.BufferAttribute(aTime, 2));
  g.setAttribute("aColor", new THREE.BufferAttribute(aColor, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}
