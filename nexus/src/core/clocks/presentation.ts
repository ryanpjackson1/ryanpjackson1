"use client";
import type { ModuleId } from "../modules";
import { CURVE, ramp, clamp01 } from "../motion";

/**
 * Cinematic presentation master clock (Phase 6).
 *
 * Opening a module runs ONE timed sequence. Every layer — ring, bracket,
 * camera push, scan line, the other cards stepping back, the DOM panel —
 * reads its envelope from this clock and nothing else, so nothing can
 * drift out of sync.
 *
 *   TARGETING  brisk: ring turns, FUI bracket converges, others step back
 *   APPROACH   carries distance: card flies to reading position, camera
 *              pushes along the view axis, scan line sweeps the face
 *   SETTLE     slow: bracket locks + dissolves, push relaxes, control returns
 */
export const PRESENT_TIMING = {
  targeting: 0.42,
  approach: 0.78,
  settle: 1.15,
} as const;

const T1 = PRESENT_TIMING.targeting;
const T2 = T1 + PRESENT_TIMING.approach;
const T3 = T2 + PRESENT_TIMING.settle;
export const PRESENT_TOTAL = T3;

export type PresentPhase = "idle" | "targeting" | "approach" | "settle" | "open";

export interface PresentEnvelopes {
  phase: PresentPhase;
  /** Card id the sequence is about. */
  id: ModuleId | null;
  /** 0 outside frame → 1 locked on the card. */
  bracket: number;
  /** Bracket opacity (dissolves during settle). */
  bracketAlpha: number;
  /** Other cards stepping back 0..1. */
  stepBack: number;
  /** Card flight toward reading position 0..1. */
  fly: number;
  /** Camera push along the view axis 0..1 (rises in approach, relaxes in settle). */
  push: number;
  /** Scan line position down the face 0..1, or -1 when not sweeping. */
  scan: number;
  /** DOM detail panel presence 0..1. */
  panel: number;
}

class PresentationClock {
  private t = 0;
  private running = false;
  private closing = false;
  id: ModuleId | null = null;
  /** Called once when the sequence commits the open (end, or on cancel). */
  onCommit: ((id: ModuleId) => void) | null = null;
  private committed = false;

  start(id: ModuleId) {
    this.id = id;
    this.t = 0;
    this.running = true;
    this.closing = false;
    this.committed = false;
  }

  /** Deliberate gesture mid-sequence: cancel motion, commit the pending open now. */
  cancelAndCommit() {
    if (!this.running || this.closing) return;
    this.t = T3;
    this.commit();
  }

  close() {
    if (!this.id) return;
    this.closing = true;
    this.running = true;
    if (this.t > T3) this.t = T3;
  }

  get active() {
    return this.running || (this.id !== null && !this.closing);
  }

  private commit() {
    if (this.committed || !this.id) return;
    this.committed = true;
    this.onCommit?.(this.id);
  }

  tick(dt: number) {
    if (!this.running) return;
    if (this.closing) {
      // Closing runs the clock backward, a little quicker than it opened.
      this.t -= dt * 1.6;
      if (this.t <= 0) {
        this.t = 0;
        this.running = false;
        this.closing = false;
        this.id = null;
      }
      return;
    }
    this.t += dt;
    if (this.t >= T2 && !this.committed) this.commit();
    if (this.t >= T3) {
      this.t = T3;
      this.running = false;
    }
  }

  envelopes(): PresentEnvelopes {
    const t = this.t;
    const phase: PresentPhase =
      this.id === null ? "idle" : t < T1 ? "targeting" : t < T2 ? "approach" : t < T3 ? "settle" : "open";
    const converge = CURVE.arriving(t / T1);
    const lockFade = ramp(t, T2 + 0.25, T3);
    const scanT = (t - T1 - 0.12) / (PRESENT_TIMING.approach * 0.8);
    return {
      phase,
      id: this.id,
      bracket: converge,
      bracketAlpha: this.id ? clamp01(converge * 1.4) * (1 - lockFade) : 0,
      stepBack: CURVE.arriving(t / (T1 * 1.3)),
      fly: CURVE.reporting(clamp01((t - T1) / PRESENT_TIMING.approach)),
      push: ramp(t, T1, T2) * (1 - 0.65 * ramp(t, T2, T3)),
      scan: scanT > 0 && scanT < 1 ? scanT : -1,
      panel: CURVE.arriving((t - T2 + 0.1) / (PRESENT_TIMING.settle * 0.7)),
    };
  }
}

export const presentation = new PresentationClock();
