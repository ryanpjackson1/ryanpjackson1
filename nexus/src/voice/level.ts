/**
 * The local synthesiser plays OUTSIDE the audio graph — the page hears
 * nothing. So the level is INFERRED: the synthesiser reports word
 * boundaries as it speaks; each word becomes one pulse per syllable that
 * opens and closes once. Voices that report no boundaries get a generic
 * cadence. Output lands in the same range the analyser produces for the
 * studio voice so everything downstream reads the two identically.
 */
export const SYLLABLE_RATE = 5.0;   // syllables / second, generic cadence
export const PEAK = 0.62;           // matches voiceLevel() on typical studio speech

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return word.trim() ? 1 : 0;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, Math.min(6, groups ? groups.length : 1));
}

interface Pulse { t0: number; dur: number; peak: number }

export class InferredLevel {
  private pulses: Pulse[] = [];
  private cadenceUntil = 0;
  private cadenceNext = 0;

  /** A word starts at time t (s); schedule one pulse per syllable. */
  word(word: string, t: number) {
    const n = syllables(word);
    const dur = 1 / SYLLABLE_RATE;
    for (let i = 0; i < n; i++) {
      this.pulses.push({ t0: t + i * dur, dur: dur * 0.92, peak: PEAK * (i === 0 ? 1 : 0.82) * (0.85 + Math.random() * 0.3) });
    }
    this.cadenceUntil = 0; // real boundaries supersede the generic cadence
  }

  /** No boundaries reported: run a generic cadence until stop(). */
  cadence(t: number) {
    this.cadenceUntil = Infinity;
    this.cadenceNext = t;
  }

  stop() {
    this.pulses = [];
    this.cadenceUntil = 0;
  }

  level(t: number): number {
    if (this.cadenceUntil > t) {
      while (this.cadenceNext < t + 0.25) {
        const dur = (1 / SYLLABLE_RATE) * (0.75 + Math.random() * 0.5);
        // a short gap every few syllables, like word breaks
        const gap = Math.random() < 0.28 ? dur * 0.8 : 0;
        this.pulses.push({ t0: this.cadenceNext, dur: dur * 0.9, peak: PEAK * (0.7 + Math.random() * 0.4) });
        this.cadenceNext += dur + gap;
      }
    }
    let v = 0;
    this.pulses = this.pulses.filter((p) => t < p.t0 + p.dur + 0.05);
    for (const p of this.pulses) {
      const k = (t - p.t0) / p.dur;
      if (k > 0 && k < 1) v = Math.max(v, p.peak * Math.pow(Math.sin(Math.PI * k), 0.8));
    }
    return v;
  }
}
