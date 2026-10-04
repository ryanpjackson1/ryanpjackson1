import { MODULE_COUNT } from "@/modules/registry";
import type { Spring } from "@/motion/spring";

/**
 * Per-frame mutable values. Writing these never re-renders React; the
 * render loop reads them. High-level state lives in the store instead.
 */
export const RING = {
  radius: 3.6,
  step: (Math.PI * 2) / MODULE_COUNT,
  cardW: 1.0,
  cardH: 1.28,
} as const;

export const rt = {
  /** Orbit angle spring; target = ringIndex · step. */
  ring: { x: 0, v: 0 } as Spring,
  /** Extra angle while the background is being dragged. */
  ringDrag: 0,
  /** Ambient-motion multiplier 0..1; settles over ~1 s, then snaps. */
  motion: 0,
  /** Advances only while motion > 0, so drift never moves a locked scene. */
  driftTime: 0,
  /** Pointer in NDC, for dragging a held card. */
  pointer: { x: 0, y: 0 },
  /** Webcam hand pointer (index fingertip) in NDC. */
  hand: { active: false, x: 0, y: 0, pinching: false },
  /** Card centres in NDC, published each frame for hand hit-testing. */
  cardScreen: Array.from({ length: MODULE_COUNT }, () => ({ x: 0, y: 0, visible: false })),
};

export const slotAngle = (i: number, ring: number) => i * RING.step - ring;
