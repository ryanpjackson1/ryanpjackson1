"use client";
import { useEffect } from "react";
import { dispatch, onCommand } from "@/commands/dispatch";
import { useNexus } from "@/state/store";
import { MODULE_IDS } from "@/modules/registry";
import { rt } from "@/render/runtime";
import { GestureClassifier, type GestureEvent } from "./classifier";
import { HandTracker } from "./tracker";
import { cameraPreflight } from "./cameraErrors";
import type { TrackingState } from "@/state/types";

/** Nearest visible card to a point in NDC, if the point is close enough. */
export function cardUnder(x: number, y: number, aspect: number, maxDist = 0.2): number {
  let best = -1, bestD = maxDist;
  rt.cardScreen.forEach((c, i) => {
    if (!c.visible) return;
    const d = Math.hypot((c.x - x) * aspect, c.y - y);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Gesture → command. The ONLY place gestures turn into intent. */
export function gestureToCommand(e: GestureEvent, pointer: { x: number; y: number } | null, aspect: number) {
  if (e.type === "swipe-left") return { type: "ring/rotate", steps: -1 } as const;
  if (e.type === "swipe-right") return { type: "ring/rotate", steps: 1 } as const;
  const i = pointer ? cardUnder(pointer.x, pointer.y, aspect) : -1;
  return i >= 0 ? ({ type: "module/open", id: MODULE_IDS[i] } as const) : ({ type: "module/open-front" } as const);
}

/**
 * Wires the camera to the command layer. The camera starts ONLY in response
 * to `tracking/start`, which the reducer accepts only from a person
 * (mouse/keyboard/launcher/ui) — never automatically, never from AI.
 */
export function useHandTracking() {
  useEffect(() => {
    let tracker: HandTracker | null = null;
    const classifier = new GestureClassifier();
    const setStatus = (s: TrackingState) => {
      const cur = useNexus.getState().tracking;
      if (cur.status !== s.status || cur.message !== s.message) dispatch({ type: "tracking/status", tracking: s }, "system");
    };

    const offStart = onCommand("tracking/start", (_c, _src, prev, next) => {
      if (next.tracking.status !== "requesting" || prev.tracking.status === "requesting") return;
      const pre = cameraPreflight({
        isSecureContext: window.isSecureContext,
        hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
        hasWasm: typeof WebAssembly === "object",
      });
      if (pre) { setStatus(pre); return; }
      tracker?.stop();
      tracker = new HandTracker();
      classifier.reset();
      void tracker.start({
        status: setStatus,
        frame: (t, hand) => {
          rt.hand.active = !!hand;
          if (hand) { rt.hand.x = hand.px; rt.hand.y = hand.py; }
          rt.hand.pinching = classifier.isPinching;
          const st = useNexus.getState();
          if (st.tracking.status === "no-hand" && hand) setStatus({ status: "active", message: "Tracking — swipe to rotate, pinch to open." });
          if (st.tracking.status === "active" && !hand) setStatus({ status: "no-hand", message: "Tracking — show one hand to the camera." });
          const aspect = window.innerWidth / window.innerHeight;
          for (const e of classifier.update(t, hand)) {
            dispatch(gestureToCommand(e, hand ? { x: hand.px, y: hand.py } : null, aspect), "gesture");
          }
          // hand hover mirrors mouse hover
          if (hand) {
            const i = cardUnder(hand.px, hand.py, aspect);
            const id = i >= 0 ? MODULE_IDS[i] : null;
            if (st.hoveredId !== id) dispatch({ type: "card/hover", id }, "gesture");
          }
        },
      });
    });
    const offStop = onCommand("tracking/stop", () => {
      tracker?.stop();
      tracker = null;
      rt.hand.active = false;
    });
    return () => { offStart(); offStop(); tracker?.stop(); rt.hand.active = false; };
  }, []);
}
