"use client";
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { extract, type HandFeatures } from "./features";

/**
 * MediaPipe Tasks Vision hand tracking. Lazy: the WASM + model load only
 * when the user turns tracking on. Runs on the GPU delegate when available.
 */
// Copied from node_modules at install (scripts/copy-mediapipe.mjs) so versions always match.
const WASM = "/mediapipe";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface TrackerFrame {
  t: number;
  hands: (HandFeatures | null)[];
  /** Handedness confidence per hand. */
  scores: number[];
  /** Raw landmarks for the HUD preview. */
  raw: { x: number; y: number }[][];
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  running = false;

  async start(onFrame: (f: TrackerFrame) => void): Promise<void> {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
    const make = (delegate: "GPU" | "CPU") =>
      vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try { this.landmarker = await make("GPU"); } catch { this.landmarker = await make("CPU"); }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: "user" },
      audio: false,
    });
    const v = document.createElement("video");
    v.srcObject = this.stream;
    v.muted = true;
    v.playsInline = true;
    await v.play();
    this.video = v;
    this.running = true;

    const loop = () => {
      if (!this.running || !this.landmarker || !this.video) return;
      const vt = this.video.currentTime;
      if (vt !== this.lastVideoTime && this.video.readyState >= 2) {
        this.lastVideoTime = vt;
        const now = performance.now();
        let res: HandLandmarkerResult | null = null;
        try { res = this.landmarker.detectForVideo(this.video, now); } catch { res = null; }
        if (res) onFrame(this.toFrame(res, now / 1000));
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Keep the two hand slots stable: slot 0 is the right hand when both are present. */
  private toFrame(res: HandLandmarkerResult, t: number): TrackerFrame {
    const hands: (HandFeatures | null)[] = [null, null];
    const scores = [0, 0];
    const raw: { x: number; y: number }[][] = [];
    const entries = res.landmarks.map((lm, i) => ({
      lm,
      label: res.handedness[i]?.[0]?.categoryName ?? "Right",
      score: res.handedness[i]?.[0]?.score ?? 0.5,
    }));
    // MediaPipe labels assume a mirrored image; ours is a selfie stream, so "Left" is the user's right
    entries.sort((a, b) => (a.label === "Left" ? -1 : 1) - (b.label === "Left" ? -1 : 1));
    entries.slice(0, 2).forEach((e, i) => {
      hands[i] = extract(e.lm);
      scores[i] = e.score;
      raw.push(e.lm.map((p) => ({ x: 1 - p.x, y: p.y })));
    });
    return { t, hands, scores, raw };
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.landmarker?.close();
    this.landmarker = null;
    this.video = null;
    this.stream = null;
  }
}
