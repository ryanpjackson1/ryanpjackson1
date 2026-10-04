/**
 * Springs by INTENT. Every interaction animates with one of these — no
 * linear tweens. Reduced motion swaps in critically-damped versions, so
 * things still arrive but never overshoot or wobble.
 */
export interface SpringConfig { stiffness: number; damping: number }
export interface Spring { x: number; v: number }

export const SPRING = {
  /** The orbit: carries momentum between slots, one soft overshoot. */
  orbit: { stiffness: 42, damping: 10 },
  /** A held card lags behind the pointer. */
  follow: { stiffness: 90, damping: 13 },
  /** A released card returning to its slot. */
  settle: { stiffness: 70, damping: 11 },
  /** Hover lift / acknowledgement. */
  acknowledge: { stiffness: 380, damping: 22 },
  /** Panels arriving. */
  arrive: { stiffness: 260, damping: 24 },
} satisfies Record<string, SpringConfig>;

export type SpringIntent = keyof typeof SPRING;

/** Critically damped equivalent: same speed, zero overshoot. */
export function critical(c: SpringConfig): SpringConfig {
  return { stiffness: c.stiffness, damping: 2 * Math.sqrt(c.stiffness) };
}

export function springFor(intent: SpringIntent, reducedMotion: boolean): SpringConfig {
  return reducedMotion ? critical(SPRING[intent]) : SPRING[intent];
}

/**
 * Semi-implicit Euler, sub-stepped for stability. When the spring is
 * within epsilon of rest it SNAPS to the target, so a resting scene is
 * exactly — not approximately — still.
 */
export function stepSpring(s: Spring, target: number, c: SpringConfig, dt: number, eps = 1e-4): Spring {
  if (s.x === target && s.v === 0) return s;
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -c.stiffness * (s.x - target) - c.damping * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x - target) < eps && Math.abs(s.v) < eps) {
    s.x = target;
    s.v = 0;
  }
  return s;
}

/** Frame-rate independent exponential approach, with snapping. */
export function approach(current: number, target: number, rate: number, dt: number, eps = 1e-4) {
  const next = current + (target - current) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - target) < eps ? target : next;
}
