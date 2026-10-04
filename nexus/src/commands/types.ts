import type { ModuleId } from "@/modules/registry";
import type { QualityTier, Renderer, TrackingState } from "@/state/types";

/**
 * The single typed command layer. Mouse, keyboard, the Ctrl+K launcher,
 * webcam gestures, HUD buttons — and, later, an AI provider — all produce
 * Commands and hand them to `dispatch`. Nothing else changes app state.
 */
export type Command =
  // ring
  | { type: "ring/rotate"; steps: number }
  | { type: "ring/focus"; id: ModuleId }
  // modules / panel
  | { type: "module/open"; id: ModuleId }
  | { type: "module/open-front" }
  | { type: "panel/close" }
  // cards
  | { type: "card/hover"; id: ModuleId | null }
  | { type: "card/grab"; id: ModuleId }
  | { type: "card/release" }
  // launcher
  | { type: "launcher/open" }
  | { type: "launcher/close" }
  | { type: "launcher/toggle" }
  // contextual dismiss (Escape)
  | { type: "escape" }
  // motion
  | { type: "motion/drift"; on?: boolean }
  | { type: "motion/reduced"; on?: boolean }
  // tracking — start requires an explicit user action (never ai/system)
  | { type: "tracking/start" }
  | { type: "tracking/stop" }
  | { type: "tracking/status"; tracking: TrackingState }
  // rendering
  | { type: "quality/set"; tier: QualityTier }
  | { type: "renderer/set"; renderer: Renderer; reason?: string };

export type CommandType = Command["type"];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
