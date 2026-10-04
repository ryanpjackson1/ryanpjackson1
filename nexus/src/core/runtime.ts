"use client";
import * as THREE from "three";
import { MODULE_IDS } from "./modules";
import type { Spring1 } from "./motion";

/**
 * Per-frame mutable state. Anything that changes every frame lives here,
 * NOT in React/zustand — writing it never triggers a render. Layers read
 * it inside useFrame.
 */
export interface HandFrame {
  present: boolean;
  /** Palm centre in NDC (-1..1), mirrored so moving right moves right. */
  x: number;
  y: number;
  /** Index tip in NDC — the pointer. */
  px: number;
  py: number;
  /** Apparent palm size (depth proxy): bigger = closer to the camera. */
  size: number;
  pinch: number;     // 0 open … 1 fully pinched
  pinching: boolean;
  openness: number;  // 0 fist … 1 open palm
}

export const rt = {
  /** Orbit angle (radians). Slot k sits at angle k·step − ring.x. */
  ring: { x: 0, v: 0 } as Spring1,
  /** Extra offset while a hand/mouse is dragging the ring directly. */
  ringDrag: 0,
  /** Ambient motion multiplier 0..1 (Phase 6). Settles over ~1 s. */
  motion: 0,
  /** Time accumulated only while motion > 0 — drift phase never advances when locked. */
  driftTime: 0,
  pointer: { x: 0, y: 0, active: false, lastMove: 0 },
  hands: [
    { present: false, x: 0, y: 0, px: 0, py: 0, size: 0, pinch: 0, pinching: false, openness: 0 },
    { present: false, x: 0, y: 0, px: 0, py: 0, size: 0, pinch: 0, pinching: false, openness: 0 },
  ] as [HandFrame, HandFrame],
  /** Two-hand zoom 0.7..1.4 (1 = rest). */
  zoom: { x: 1, v: 0 } as Spring1,
  zoomTarget: 1,
  /** World matrices each card publishes every frame (Phase 7 dissolve). */
  cardMatrices: MODULE_IDS.map(() => new THREE.Matrix4()),
  /** The canvas every card face is drawn into — sampled pixel-for-pixel by the dissolve. */
  cardCanvases: [] as HTMLCanvasElement[],
  /** Speech level 0..1 for the active voice (analyser or inferred). */
  speech: 0,
  /** Mouth openness the figure is showing (0..1 in five steps) — read by verification. */
  mouth: 0,
  /** Wake wave start time (performance.now()/1000) or -1. */
  wakeAt: -1,
  /** Last ripple per card: [time, u, v]. */
  ripples: MODULE_IDS.map(() => [-10, 0.5, 0.5] as [number, number, number]),
  /** World change crossover spike 0..1 (grade split + halation). */
  crossover: 0,
  /** Elapsed seconds (scene clock). */
  time: 0,
  camera: null as THREE.PerspectiveCamera | null,
  /** Performance monitor judgement suspended (Phase 7 protection). */
  perfSuspended: false,
  /** Tier change waiting for the ring to return. */
  pendingTier: -1,
  /** Screen-space anchor (CSS px) of the panel held above the hand, or null. */
  handAnchor: null as null | { x: number; y: number; visible: number },
  /** Screen-space centre of each presented panel slot (head looks at it). */
  panelTargets: [] as { x: number; y: number }[],
  /** Head look target in NDC. */
  look: { x: 0, y: 0 },
};

export const RING = {
  radius: 3.7,
  step: (Math.PI * 2) / MODULE_IDS.length,
  cardW: 1.06,
  cardH: 1.34,
  y: 0.05,
} as const;

/** Angle of slot i relative to the front, after the ring has turned by `ring`. */
export const slotAngle = (i: number, ring: number) => i * RING.step - ring;

export const nowS = () => performance.now() / 1000;
