"use client";
import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { HandTracker, type TrackerFrame } from "./handTracker";
import { GestureClassifier, type GestureEvent } from "./classifier";
import { rt, RING } from "@/core/runtime";
import { MODULE_IDS } from "@/core/modules";
import { useNexus, log } from "@/stores/nexus";
import { dispatch } from "@/core/dispatch";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { wake } from "@/voice/recognition";
import { uiSound } from "@/audio/engine";

/** Latest raw landmarks for the HUD hand preview (no React state). */
export const handPreview = { raw: [] as { x: number; y: number }[][], t: 0 };

const LABEL: Record<string, string> = {
  "swipe-left": "SWIPE ←", "swipe-right": "SWIPE →", "pinch-start": "PINCH", "pinch-end": "RELEASE",
  pull: "PULL", push: "PUSH", "palm-hold": "PALM · HOLD", "palm-release": "PALM · RELEASE", open: "OPEN HAND",
  fist: "CLOSED HAND", circle: "CIRCLE · AI", zoom: "TWO-HAND ZOOM", group: "GROUP", split: "SPLIT", fling: "THROW",
  "second-pinch": "MULTI-SELECT",
};

/** Gestures that act on the ring are ignored while there is no ring. */
const RING_GESTURES = new Set(["swipe-left", "swipe-right", "pinch-start", "pinch-end", "pull", "push", "palm-hold", "zoom", "group", "split", "fling", "second-pinch", "fist"]);
/** Deliberate gestures cancel a presentation sequence (committing the open). */
const DELIBERATE = new Set(["swipe-left", "swipe-right", "push", "fist", "fling"]);

const v = new THREE.Vector3();

/** Nearest card to an NDC point, in screen space. */
export function cardAt(ndcX: number, ndcY: number, maxDist = 0.22): number {
  const cam = rt.camera;
  if (!cam) return -1;
  let best = -1, bestD = maxDist;
  for (let i = 0; i < MODULE_IDS.length; i++) {
    v.setFromMatrixPosition(rt.cardMatrices[i]);
    const toCard = v.clone().sub(cam.position);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    if (toCard.dot(fwd) < 0) continue;
    v.project(cam);
    const d = Math.hypot((v.x - ndcX) * cam.aspect, v.y - ndcY);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function onEvent(e: GestureEvent) {
  const st = useNexus.getState();
  st.setGesture(LABEL[e.type] ?? e.type, e.confidence, rt.hands[1].present ? 2 : 1);
  if (formClock.engaged && RING_GESTURES.has(e.type)) return; // no ring: wake + tracking still pass
  if (presentation.id && DELIBERATE.has(e.type)) presentation.cancelAndCommit();

  const hand = rt.hands[e.hand];
  switch (e.type) {
    case "swipe-left": void dispatch({ kind: "rotate", dir: -1 }, "gesture"); return;
    case "swipe-right": void dispatch({ kind: "rotate", dir: 1 }, "gesture"); return;
    case "pinch-start": {
      const i = cardAt(hand.px, hand.py);
      if (i >= 0) {
        st.set({ dragging: MODULE_IDS[i], selected: MODULE_IDS[i] });
        rt.ripples[i] = [rt.time, 0.5, 0.5];
        uiSound("grab");
      }
      return;
    }
    case "pinch-end": {
      if (st.dragging) {
        // released cards return straight to their orbit slot on the orbit spring — no physics
        st.set({ dragging: null });
        uiSound("drop");
      }
      return;
    }
    case "pull": {
      const id = st.dragging ?? st.hovered;
      if (id) { st.set({ dragging: null }); void dispatch({ kind: "open-module", id }, "gesture"); }
      return;
    }
    case "push": {
      st.set({ dragging: null });
      void dispatch({ kind: "close" }, "gesture");
      return;
    }
    case "fist": {
      if (st.expanded) void dispatch({ kind: "close" }, "gesture");
      return;
    }
    case "palm-hold": {
      if (!st.frozen) { st.set({ frozen: true }); uiSound("freeze"); log("GESTURE · palm held — movement frozen"); }
      return;
    }
    case "palm-release": {
      if (st.frozen) { st.set({ frozen: false }); uiSound("unfreeze"); }
      return;
    }
    case "circle": {
      wake("gesture"); // reserved for the AI
      return;
    }
    case "zoom": {
      rt.zoomTarget = Math.max(0.72, Math.min(1.4, 1 / (e.value ?? 1)));
      return;
    }
    case "fling": {
      // a throw becomes orbit momentum — the card never leaves the ring
      const steps = Math.max(1, Math.min(4, Math.round(Math.abs(e.value ?? 0) / 1.6)));
      const dir = (e.value ?? 0) < 0 ? 1 : -1;
      rt.ring.v += dir * steps * RING.step * 2.2;
      st.set({ ringIndex: st.ringIndex + dir * steps, dragging: null });
      uiSound("swipe");
      return;
    }
    case "second-pinch": {
      const i = cardAt(hand.px, hand.py);
      if (i >= 0) {
        const id = MODULE_IDS[i];
        const ms = st.multiSelect.includes(id) ? st.multiSelect.filter((x) => x !== id) : [...st.multiSelect, id];
        st.set({ multiSelect: ms });
        uiSound("select");
      }
      return;
    }
    case "group": {
      if (st.multiSelect.length) log(`GESTURE · grouped ${st.multiSelect.length} cards`);
      uiSound("confirm");
      return;
    }
    case "split": {
      if (st.multiSelect.length) { st.set({ multiSelect: [] }); log("GESTURE · group split"); uiSound("close"); }
      return;
    }
  }
}

export function useGestures() {
  const tracker = useRef<HandTracker | null>(null);
  const classifier = useRef(new GestureClassifier());
  const tracking = useNexus((s) => s.tracking);

  const onFrame = useCallback((f: TrackerFrame) => {
    const st = useNexus.getState();
    handPreview.raw = f.raw;
    handPreview.t = f.t;
    f.hands.forEach((h, i) => {
      const slot = rt.hands[i];
      if (!h) { slot.present = false; slot.pinching = false; return; }
      // light smoothing — the cards' own following spring provides the lag
      const k = slot.present ? 0.55 : 1;
      slot.present = true;
      slot.x += (h.x - slot.x) * k;
      slot.y += (h.y - slot.y) * k;
      slot.px += (h.px - slot.px) * k;
      slot.py += (h.py - slot.py) * k;
      slot.size = h.size;
      slot.pinch = GestureClassifier.pinchAmount(h);
      slot.openness = h.openness;
    });
    const events = classifier.current.update(f.t, f.hands);
    rt.hands[0].pinching = classifier.current.isPinching(0);
    rt.hands[1].pinching = classifier.current.isPinching(1);
    events.forEach(onEvent);
    // hand hover
    const any = f.hands[0];
    if (any && !formClock.engaged && !st.dragging) {
      const i = cardAt(rt.hands[0].px, rt.hands[0].py, 0.16);
      const id = i >= 0 ? MODULE_IDS[i] : null;
      if (id !== st.hovered) { st.set({ hovered: id }); if (id) uiSound("hover"); }
    }
    const status = f.hands[0] ? "active" : "no-hand";
    if (st.tracking !== status) st.set({ tracking: status });
    if (!f.hands[0] && !f.hands[1] && st.gesture.name !== "—" && performance.now() - st.gesture.at > 1500) st.setGesture("—", 0, 0);
  }, []);

  useEffect(() => {
    if (tracking !== "loading") return;
    const t = new HandTracker();
    tracker.current = t;
    t.start(onFrame)
      .then(() => { useNexus.getState().set({ tracking: "no-hand" }); log("TRACKING · MediaPipe hand landmarker online", "ok"); })
      .catch((e: Error) => {
        const denied = /denied|NotAllowed|Permission/i.test(e.message + e.name);
        useNexus.getState().set({ tracking: denied ? "denied" : "error" });
        log(denied ? "TRACKING · camera permission denied — mouse fallback active" : `TRACKING · ${e.message} — mouse fallback active`, "warn");
        t.stop();
      });
  }, [tracking, onFrame]);

  useEffect(() => () => tracker.current?.stop(), []);

  return {
    start: () => useNexus.getState().set({ tracking: "loading" }),
    stop: () => {
      tracker.current?.stop();
      tracker.current = null;
      rt.hands.forEach((h) => (h.present = false));
      useNexus.getState().set({ tracking: "off" });
    },
  };
}
