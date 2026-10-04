/**
 * Mouth openness from the speech level: an envelope follower with a fast
 * attack and a slower release, held to FIVE discrete steps — a mechanism,
 * not a membrane. Silence closes it exactly.
 */
export const MOUTH_STEPS = 5;
export const JAW_MAX = 0.14; // radians at full openness

export interface MouthState { env: number; open: number }

export function stepMouth(s: MouthState, level: number, dt: number): MouthState {
  const attack = 1 - Math.exp(-dt / 0.022);
  const release = 1 - Math.exp(-dt / 0.11);
  s.env += (level - s.env) * (level > s.env ? attack : release);
  if (s.env < 0.035) s.env = level < 0.01 ? 0 : s.env;
  const q = s.env < 0.06 ? 0 : Math.min(MOUTH_STEPS - 1, Math.floor(s.env * MOUTH_STEPS * 1.05)) / (MOUTH_STEPS - 1);
  s.open = q;
  return s;
}
