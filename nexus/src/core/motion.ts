/**
 * Motion vocabulary (Phase 6). Every animation in NEXUS names its INTENT
 * rather than inlining magic numbers. Springs are physical (stiffness /
 * damping per unit mass); curves are pure functions of 0..1.
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** Springs by intent. Under-damped ones overshoot on purpose. */
export const SPRING = {
  /** Something arriving to rest: lands with one soft overshoot. */
  arriving: { stiffness: 120, damping: 14 },
  /** Something leaving: no overshoot, gets out of the way. */
  leaving: { stiffness: 90, damping: 19 },
  /** A small nod that a gesture registered. Quick, bouncy. */
  acknowledging: { stiffness: 420, damping: 18 },
  /** Data reporting in (numbers, bars). Firm, barely overshoots. */
  reporting: { stiffness: 200, damping: 26 },
  /** Idle drift. Very soft. */
  drifting: { stiffness: 6, damping: 4.2 },
  /** The orbit — carries momentum across slots, settles with elasticity. */
  orbit: { stiffness: 38, damping: 9.5 },
  /** Cards lagging behind the hand. */
  following: { stiffness: 70, damping: 11 },
} satisfies Record<string, SpringConfig>;

export type SpringIntent = keyof typeof SPRING;

/** framer-motion transition from an intent. */
export const fmSpring = (intent: SpringIntent) => ({ type: "spring" as const, ...SPRING[intent] });

/** Semi-implicit Euler spring step. Mutates and returns state. */
export interface Spring1 { x: number; v: number }
export function stepSpring(s: Spring1, target: number, cfg: SpringConfig, dt: number): Spring1 {
  const m = cfg.mass ?? 1;
  // Sub-step for stability under frame hitches.
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = (-cfg.stiffness * (s.x - target) - cfg.damping * s.v) / m;
    s.v += a * h;
    s.x += s.v * h;
  }
  return s;
}

export const settled = (s: Spring1, target: number, eps = 1e-4) =>
  Math.abs(s.x - target) < eps && Math.abs(s.v) < eps;

/** Curves by intent, t ∈ [0,1] → [0,1]. */
export const CURVE = {
  arriving: (t: number) => 1 - Math.pow(1 - clamp01(t), 3),
  leaving: (t: number) => Math.pow(clamp01(t), 2.2),
  acknowledging: (t: number) => { const x = clamp01(t); return Math.sin(x * Math.PI) * (1 - x * 0.4); },
  reporting: (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  drifting: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)),
  /** Edge-first erosion used by both the card face and its particles. */
  eroding: (t: number) => smoothstep(0, 1, t),
} as const;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** Window envelope: 0 before a, rises to 1 by b. */
export const ramp = (t: number, a: number, b: number) => smoothstep(a, b, t);
/** Exponential approach, frame-rate independent. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Shortest signed angle a→b. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Boot choreography — ONE composed beat. Every boot element reads its
 * offset from here so the sequence can be re-timed in one place.
 */
export const BOOT_BEAT = 0.42; // seconds
export const BOOT = {
  black: 0,
  wordmark: 1 * BOOT_BEAT,
  diagnostics: 2 * BOOT_BEAT,
  atmosphere: 4 * BOOT_BEAT,
  ring: 5.5 * BOOT_BEAT,
  hud: 7 * BOOT_BEAT,
  ready: 8.5 * BOOT_BEAT,
} as const;
