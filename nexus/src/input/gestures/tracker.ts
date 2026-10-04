"use client";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { extractFeatures, type HandFeatures } from "./features";
import { describeCameraError } from "./cameraErrors";
import type { TrackingState } from "@/state/types";

/**
 * Webcam → hand features. Lazy: nothing (WASM, model, camera) loads until
 * start() is called from an explicit user action.
 *
 * WASM is served from /mediapipe (copied from node_modules at install).
 * The model is read from /models/hand_landmarker.task when present
 * (`npm run fetch-model`), otherwise from Google's model CDN.
 */
const LOCAL_MODEL = "/models/hand_landmarker.task";
const REMOTE_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface TrackerCallbacks {
  status(s: TrackingState): void;
  frame(t: number, hand: HandFeatures | null): void;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private stopped = false;
  private lastVideoTime = -1;

  async start(cb: TrackerCallbacks): Promise<void> {
    this.stopped = false;
    // 1. camera first, so the permission prompt appears immediately
    cb.status({ status: "requesting", message: "Waiting for camera permission…", hint: "Your browser will ask to use the camera." });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
    } catch (e) {
      cb.status(describeCameraError(e, "camera"));
      return;
    }
    if (this.stopped) return this.stop();
    this.stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      cb.status({ status: "error", message: "The camera stopped (unplugged or taken by another app).", hint: "Reconnect it and enable tracking again." });
      this.stop();
    });

    // 2. MediaPipe runtime + model
    cb.status({ status: "loading", message: "Loading the hand-tracking model…" });
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe");
      const local = await fetch(LOCAL_MODEL, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      const modelAssetPath = local ? LOCAL_MODEL : REMOTE_MODEL;
      const make = (delegate: "GPU" | "CPU") =>
        vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try { this.landmarker = await make("GPU"); } catch { this.landmarker = await make("CPU"); }
    } catch (e) {
      cb.status(describeCameraError(e, "model"));
      this.stop();
      return;
    }
    if (this.stopped) return this.stop();

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = this.stream;
    await v.play().catch(() => {});
    this.video = v;
    cb.status({ status: "no-hand", message: "Tracking — show one hand to the camera." });

    const loop = () => {
      if (this.stopped || !this.landmarker || !this.video) return;
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        const now = performance.now();
        try {
          const res = this.landmarker.detectForVideo(this.video, now);
          cb.frame(now / 1000, res.landmarks[0] ? extractFeatures(res.landmarks[0]) : null);
        } catch { /* a dropped frame is not fatal */ }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close();
    this.landmarker = null;
    this.stream = null;
    this.video = null;
  }
}
