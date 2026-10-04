import type { HandFeatures } from "./features";

/**
 * Pure, time-based classifier for the two milestone gestures:
 *   swipe-left / swipe-right — fast horizontal palm travel
 *   pinch                    — thumb meets index (fires once per pinch)
 * Feed it (time in seconds, features | null); it returns events.
 */
export type GestureEvent =
  | { type: "swipe-left"; confidence: number }
  | { type: "swipe-right"; confidence: number }
  | { type: "pinch"; confidence: number };

export const GESTURE_TUNING = {
  /** Pinch closes below this ratio and must reopen above `pinchOff` (hysteresis). */
  pinchOn: 0.32,
  pinchOff: 0.5,
  /** Swipe: palm travels at least this far (NDC) within the window… */
  swipeDistance: 0.45,
  swipeWindow: 0.32,
  /** …mostly horizontally… */
  swipeMaxSlope: 0.6,
  /** …and then nothing else fires for this long. */
  swipeCooldown: 0.7,
} as const;

interface Sample { t: number; x: number; y: number }

export class GestureClassifier {
  private hist: Sample[] = [];
  private pinched = false;
  private lastSwipe = -Infinity;

  reset() {
    this.hist = [];
    this.pinched = false;
  }

  get isPinching() { return this.pinched; }

  update(t: number, f: HandFeatures | null): GestureEvent[] {
    const out: GestureEvent[] = [];
    if (!f) { this.reset(); return out; }
    const T = GESTURE_TUNING;

    // pinch with hysteresis — one event per closure
    if (!this.pinched && f.pinch < T.pinchOn) {
      this.pinched = true;
      out.push({ type: "pinch", confidence: Math.min(1, (T.pinchOff - f.pinch) / (T.pinchOff - 0.1)) });
    } else if (this.pinched && f.pinch > T.pinchOff) {
      this.pinched = false;
    }

    // swipe — ignored while pinching so a grab doesn't rotate the ring
    this.hist.push({ t, x: f.x, y: f.y });
    while (this.hist.length && t - this.hist[0].t > T.swipeWindow) this.hist.shift();
    if (!this.pinched && t - this.lastSwipe > T.swipeCooldown && this.hist.length >= 3) {
      const a = this.hist[0], b = this.hist[this.hist.length - 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) >= T.swipeDistance && Math.abs(dy) <= Math.abs(dx) * T.swipeMaxSlope) {
        this.lastSwipe = t;
        this.hist = [];
        const confidence = Math.min(1, Math.abs(dx) / (T.swipeDistance * 2));
        out.push(dx < 0 ? { type: "swipe-left", confidence } : { type: "swipe-right", confidence });
      }
    }
    return out;
  }
}
