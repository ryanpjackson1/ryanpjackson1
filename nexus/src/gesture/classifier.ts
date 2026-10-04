import type { HandFeatures } from "./features";

/**
 * Time-series gesture classifier. Pure: feed it features with timestamps
 * (seconds) and it returns discrete events. No DOM, no MediaPipe — so it is
 * unit-testable with synthetic hands.
 */
export type GestureType =
  | "swipe-left" | "swipe-right"
  | "pinch-start" | "pinch-end"
  | "pull" | "push"
  | "palm-hold" | "palm-release"
  | "open" | "fist"
  | "circle"
  | "zoom" | "group" | "split" | "fling" | "second-pinch";

export interface GestureEvent {
  type: GestureType;
  hand: 0 | 1;
  confidence: number;
  value?: number;
}

interface Sample { t: number; x: number; y: number; px: number; py: number; size: number }

interface HandState {
  hist: Sample[];
  pinching: boolean;
  pinchSize: number;
  pullFired: boolean;
  pinchT: number;
  still: number;     // seconds of stillness with an open palm
  holding: boolean;
  closed: number;    // seconds closed
  fistFired: boolean;
  lastSwipe: number;
  lastCircle: number;
  wasOpen: boolean;
}

const newHand = (): HandState => ({
  hist: [], pinching: false, pinchSize: 0, pullFired: false, pinchT: 0, still: 0, holding: false,
  closed: 0, fistFired: false, lastSwipe: -9, lastCircle: -9, wasOpen: false,
});

export const TUNING = {
  pinchOn: 0.34,
  pinchOff: 0.5,
  swipeWindow: 0.3,
  swipeDist: 0.5,
  swipeCooldown: 0.65,
  holdSpeed: 0.18,
  holdTime: 0.9,
  pullRatio: 1.28,
  pushRatio: 0.8,
  circleTurns: 1.75 * Math.PI,
  circleWindow: 1.6,
  circleCooldown: 2.2,
  flingSpeed: 2.4,
} as const;

export class GestureClassifier {
  private h: [HandState, HandState] = [newHand(), newHand()];
  private two = { active: false, startDist: 0, lastDist: 0, mode: "none" as "none" | "zoom", lastEvent: -9 };

  reset(hand: 0 | 1) { this.h[hand] = newHand(); }

  /** Pinch amount 0..1 for display. */
  static pinchAmount(f: HandFeatures) {
    return Math.max(0, Math.min(1, (0.62 - f.pinchDist) / 0.4));
  }

  isPinching(hand: 0 | 1) { return this.h[hand].pinching; }

  update(t: number, hands: (HandFeatures | null)[]): GestureEvent[] {
    const out: GestureEvent[] = [];
    hands.forEach((f, i) => {
      const k = i as 0 | 1;
      if (!f) { if (this.h[k].hist.length) this.reset(k); return; }
      this.updateHand(k, t, f, out);
    });
    this.updateTwo(t, hands, out);
    return out;
  }

  private updateHand(k: 0 | 1, t: number, f: HandFeatures, out: GestureEvent[]) {
    const s = this.h[k];
    s.hist.push({ t, x: f.x, y: f.y, px: f.px, py: f.py, size: f.size });
    while (s.hist.length && t - s.hist[0].t > 2) s.hist.shift();
    const prev = s.hist.length > 1 ? s.hist[s.hist.length - 2] : null;
    const dt = prev ? Math.max(1e-3, t - prev.t) : 1 / 30;

    // ── pinch with hysteresis; pull / push relative to the grab ───────
    if (!s.pinching && f.pinchDist < TUNING.pinchOn) {
      s.pinching = true; s.pinchSize = f.size; s.pullFired = false; s.pinchT = t;
      out.push({ type: "pinch-start", hand: k, confidence: Math.min(1, (TUNING.pinchOff - f.pinchDist) / 0.3) });
    } else if (s.pinching && f.pinchDist > TUNING.pinchOff) {
      s.pinching = false;
      // fling: released while moving fast
      const v = this.velocity(s, 0.12);
      if (Math.abs(v.x) > TUNING.flingSpeed) out.push({ type: "fling", hand: k, confidence: Math.min(1, Math.abs(v.x) / 4), value: v.x });
      out.push({ type: "pinch-end", hand: k, confidence: 0.9 });
    }
    if (s.pinching && !s.pullFired) {
      const r = f.size / s.pinchSize;
      if (r > TUNING.pullRatio) { s.pullFired = true; out.push({ type: "pull", hand: k, confidence: Math.min(1, (r - 1) / 0.5) }); }
      else if (r < TUNING.pushRatio) { s.pullFired = true; out.push({ type: "push", hand: k, confidence: Math.min(1, (1 - r) / 0.35) }); }
    }

    // ── open / fist ─────────────────────────────────────────────────
    const open = f.openness >= 0.8;
    if (open && !s.wasOpen) out.push({ type: "open", hand: k, confidence: f.openness });
    s.wasOpen = open;
    if (f.openness <= 0.2 && !s.pinching) {
      s.closed += dt;
      if (s.closed > 0.28 && !s.fistFired) { s.fistFired = true; out.push({ type: "fist", hand: k, confidence: 1 - f.openness }); }
    } else { s.closed = 0; s.fistFired = false; }

    // ── swipe: fast horizontal travel of an open, non-pinching hand ───
    if (!s.pinching && f.openness >= 0.6 && t - s.lastSwipe > TUNING.swipeCooldown) {
      const w = s.hist.filter((h) => t - h.t <= TUNING.swipeWindow);
      if (w.length >= 3) {
        const dx = w[w.length - 1].x - w[0].x;
        const dy = w[w.length - 1].y - w[0].y;
        if (Math.abs(dx) > TUNING.swipeDist && Math.abs(dy) < Math.abs(dx) * 0.55) {
          s.lastSwipe = t;
          s.still = 0;
          out.push({ type: dx < 0 ? "swipe-left" : "swipe-right", hand: k, confidence: Math.min(1, Math.abs(dx) / 0.9) });
        }
      }
    }

    // ── palm held still: freeze ──────────────────────────────────────
    const v = this.velocity(s, 0.25);
    const speed = Math.hypot(v.x, v.y);
    if (open && speed < TUNING.holdSpeed && !s.pinching) {
      s.still += dt;
      if (!s.holding && s.still > TUNING.holdTime) { s.holding = true; out.push({ type: "palm-hold", hand: k, confidence: Math.min(1, f.openness) }); }
    } else {
      s.still = 0;
      if (s.holding) { s.holding = false; out.push({ type: "palm-release", hand: k, confidence: 0.8 }); }
    }

    // ── circle (reserved for the AI): fingertip winds ≥ ~1.75 turns of π ─
    if (t - s.lastCircle > TUNING.circleCooldown) {
      const w = s.hist.filter((h) => t - h.t <= TUNING.circleWindow);
      if (w.length >= 12) {
        const cx = w.reduce((a, h) => a + h.px, 0) / w.length;
        const cy = w.reduce((a, h) => a + h.py, 0) / w.length;
        let total = 0;
        let prevA = Math.atan2(w[0].py - cy, w[0].px - cx);
        const radii: number[] = [];
        for (const h of w) {
          const a = Math.atan2(h.py - cy, h.px - cx);
          let d = a - prevA;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          total += d;
          prevA = a;
          radii.push(Math.hypot(h.px - cx, h.py - cy));
        }
        const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
        const sd = Math.sqrt(radii.reduce((a, b) => a + (b - mean) ** 2, 0) / radii.length);
        if (Math.abs(total) > TUNING.circleTurns && mean > 0.07 && sd / mean < 0.45) {
          s.lastCircle = t;
          s.hist = [];
          out.push({ type: "circle", hand: k, confidence: Math.min(1, Math.abs(total) / (2 * Math.PI)) * (1 - sd / mean) });
        }
      }
    }
  }

  private velocity(s: HandState, win: number) {
    const last = s.hist[s.hist.length - 1];
    const w = s.hist.filter((h) => last.t - h.t <= win);
    if (w.length < 2) return { x: 0, y: 0 };
    const a = w[0], b = w[w.length - 1];
    const dt = Math.max(1e-3, b.t - a.t);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }

  private updateTwo(t: number, hands: (HandFeatures | null)[], out: GestureEvent[]) {
    const [a, b] = hands;
    if (!a || !b) { this.two.active = false; this.two.mode = "none"; return; }
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const both = this.h[0].pinching && this.h[1].pinching;
    if (both) {
      if (this.two.mode !== "zoom") { this.two.mode = "zoom"; this.two.startDist = dist; }
      out.push({ type: "zoom", hand: 0, confidence: 0.9, value: dist / Math.max(0.05, this.two.startDist) });
    } else this.two.mode = "none";
    // group / split: two open palms moving together / apart quickly
    if (!this.two.active) { this.two.active = true; this.two.lastDist = dist; return; }
    const rate = dist - this.two.lastDist;
    this.two.lastDist = dist;
    const bothOpen = a.openness >= 0.8 && b.openness >= 0.8;
    if (bothOpen && t - this.two.lastEvent > 1.2) {
      if (rate < -0.05 && dist < 0.45) { this.two.lastEvent = t; out.push({ type: "group", hand: 0, confidence: 0.8 }); }
      if (rate > 0.05 && dist > 0.9) { this.two.lastEvent = t; out.push({ type: "split", hand: 0, confidence: 0.8 }); }
    }
    // second hand pinching while the first holds a pinch: multi-select
    if (this.h[0].pinching && this.h[1].pinching && t - this.h[1].pinchT < 0.05 && this.h[0].pinchT < this.h[1].pinchT) {
      out.push({ type: "second-pinch", hand: 1, confidence: 0.85 });
    }
  }
}
