import type { ModuleId } from "@/modules/registry";

export type TrackingStatus =
  | "off"            // camera never requested
  | "requesting"     // waiting for the browser permission prompt
  | "loading"        // permission granted, loading the hand model
  | "active"         // tracking, hand visible
  | "no-hand"        // tracking, no hand in frame
  | "denied"         // permission refused
  | "no-camera"      // no video input device
  | "in-use"         // camera held by another app (common on Windows)
  | "insecure"       // not a secure context (use http://localhost)
  | "unsupported"    // browser lacks getUserMedia / WebAssembly
  | "model-failed"   // MediaPipe runtime or model could not load
  | "error";

export interface TrackingState {
  status: TrackingStatus;
  /** Human-readable message for the HUD. */
  message?: string;
  /** What the user can do about it. */
  hint?: string;
}

export type Renderer = "pending" | "webgl" | "fallback";
export type QualityTier = 0 | 1 | 2;
export type CommandSource = "mouse" | "keyboard" | "launcher" | "gesture" | "ui" | "system" | "ai";

export interface NexusState {
  /** Integer slot the orbit is heading to; front module = ringIndex mod 10. */
  ringIndex: number;
  hoveredId: ModuleId | null;
  selectedId: ModuleId | null;
  /** Module whose panel is open (modal). */
  openId: ModuleId | null;
  /** Card currently held by the pointer or a pinch; it springs back on release. */
  grabbedId: ModuleId | null;
  launcherOpen: boolean;
  /** Ambient drift. OFF by default. */
  drift: boolean;
  reducedMotion: boolean;
  tracking: TrackingState;
  renderer: Renderer;
  rendererReason?: string;
  quality: QualityTier;
  lastCommand: { type: string; source: CommandSource; at: number } | null;
}

export const INITIAL_STATE: NexusState = {
  ringIndex: 0,
  hoveredId: null,
  selectedId: null,
  openId: null,
  grabbedId: null,
  launcherOpen: false,
  drift: false,
  reducedMotion: false,
  tracking: { status: "off" },
  renderer: "pending",
  quality: 1,
  lastCommand: null,
};
