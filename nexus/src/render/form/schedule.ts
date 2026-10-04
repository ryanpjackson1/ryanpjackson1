"use client";
import { MODULE_IDS } from "@/core/modules";
import { LEAVE } from "@/core/clocks/form";
import { RING, rt, slotAngle } from "@/core/runtime";

/**
 * When each card begins to erode. Fixed at the instant of the command:
 * cards BEHIND the user go first, the card in front of you goes last.
 * Both the card shader and the particle buffer read these numbers.
 */
export const cardLeave = MODULE_IDS.map(() => ({ start: 99, span: 1 }));

export function scheduleCardLeave() {
  const order = MODULE_IDS.map((_, i) => {
    const a = slotAngle(i, rt.ring.x + rt.ringDrag);
    const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); // 0 front … π behind
    return { i, off };
  }).sort((a, b) => b.off - a.off);
  const n = order.length;
  const perCard = LEAVE.span * 0.42;
  order.forEach(({ i }, rank) => {
    cardLeave[i].start = LEAVE.start + (rank / (n - 1)) * (LEAVE.span - perCard);
    cardLeave[i].span = perCard;
  });
}

export function resetCardLeave() {
  cardLeave.forEach((c) => { c.start = 99; c.span = 1; });
}

/** The point everything gathers into, and where the figure stands. */
export const CORE = { x: 0, y: 0.02, z: -2.55 } as const;
export const FIGURE_SCALE = 1.0;
export { RING };
