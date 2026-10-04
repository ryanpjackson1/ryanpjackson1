"use client";
import * as THREE from "three";
import { WORLDS, type Grade, type WorldId } from "./worlds";
import { damp } from "@/core/motion";
import { rt } from "@/core/runtime";

/**
 * The live, blended environment. A world change is a cinematic cut: the
 * blend runs ~1.6 s and the grade's split + halation spike at the
 * crossover point so the change reads as a cut, not a fade.
 */
export const live = {
  from: "studio" as WorldId,
  to: "studio" as WorldId,
  t: 1, // 0..1 blend progress
  fog: new THREE.Color(WORLDS.studio.fog),
  fogDensity: WORLDS.studio.fogDensity,
  key: new THREE.Color(WORLDS.studio.key),
  fill: new THREE.Color(WORLDS.studio.fill),
  beam: new THREE.Color(WORLDS.studio.beamColor),
  beams: WORLDS.studio.beams,
  dust: WORLDS.studio.dust,
  grade: { ...WORLDS.studio.grade } as Grade,
  floorFrom: WORLDS.studio.floor,
  floorTo: WORLDS.studio.floor,
  /** Module-driven overrides (Phase 4 AI worlds). */
  market: 0,     // stocks open → floor becomes a market grid
  projects: 0,   // projects open → constellation of project worlds
  /** Weather reflected in the whole world. */
  weather: { rain: 0, cloud: 0, fog: 0, sun: 0, snow: 0, storm: 0 },
};

const ca = new THREE.Color();
const cb = new THREE.Color();

export function setWorld(id: WorldId) {
  if (id === live.to) return;
  live.from = live.to;
  live.to = id;
  live.t = 0;
  live.floorFrom = WORLDS[live.from].floor;
  live.floorTo = WORLDS[id].floor;
}

const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

export function tickWorld(dt: number, targets: { market: number; projects: number; weather: typeof live.weather }) {
  live.t = Math.min(1, live.t + dt / 1.6);
  const e = live.t * live.t * (3 - 2 * live.t);
  const A = WORLDS[live.from], B = WORLDS[live.to];
  live.fog.copy(ca.set(A.fog)).lerp(cb.set(B.fog), e);
  live.key.copy(ca.set(A.key)).lerp(cb.set(B.key), e);
  live.fill.copy(ca.set(A.fill)).lerp(cb.set(B.fill), e);
  live.beam.copy(ca.set(A.beamColor)).lerp(cb.set(B.beamColor), e);
  live.fogDensity = A.fogDensity + (B.fogDensity - A.fogDensity) * e;
  live.beams = A.beams + (B.beams - A.beams) * e;
  live.dust = A.dust + (B.dust - A.dust) * e;
  const ga = A.grade, gb = B.grade;
  const g = live.grade;
  g.shadow = mix3(ga.shadow, gb.shadow, e);
  g.highlight = mix3(ga.highlight, gb.highlight, e);
  g.split = ga.split + (gb.split - ga.split) * e;
  g.contrast = ga.contrast + (gb.contrast - ga.contrast) * e;
  g.warmth = ga.warmth + (gb.warmth - ga.warmth) * e;
  g.halation = ga.halation + (gb.halation - ga.halation) * e;
  g.bleed = ga.bleed + (gb.bleed - ga.bleed) * e;
  g.saturation = ga.saturation + (gb.saturation - ga.saturation) * e;
  // Crossover spike: peaks at the midpoint of the blend.
  rt.crossover = live.t < 1 ? Math.sin(Math.PI * live.t) : 0;

  live.market = damp(live.market, targets.market, 3, dt);
  live.projects = damp(live.projects, targets.projects, 3, dt);
  const w = live.weather, tw = targets.weather;
  (Object.keys(w) as (keyof typeof w)[]).forEach((k) => { w[k] = damp(w[k], tw[k], 1.5, dt); });
  // weather thickens the fog
  live.fogDensity *= 1 + w.fog * 1.6 + w.cloud * 0.35 + w.rain * 0.4 + w.snow * 0.3;
  if (w.sun > 0.01) live.key.lerp(ca.setRGB(1.0, 0.86, 0.68), w.sun * 0.35);
}
