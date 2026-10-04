import type { ModuleId } from "./modules";
import type { WorldId } from "@/render/scene/worlds";
import type { BridgeArgs, BridgeVerb } from "@/bridge/verbs";

/**
 * Everything NEXUS can be asked to do. Voice (local matcher + model tool
 * calls), gestures and the ⌘K palette all produce Intents and hand them to
 * `dispatch` (core/dispatch.ts). Nothing else mutates high-level state.
 */
export type BridgeIntent = { [V in BridgeVerb]: { kind: "bridge"; verb: V; args: BridgeArgs[V] } }[BridgeVerb];

export type Intent =
  | { kind: "open-module"; id: ModuleId }
  | { kind: "present-module"; id: ModuleId }      // embodied: panel beside the figure
  | { kind: "close" }
  | { kind: "rotate"; dir: -1 | 1 }
  | { kind: "world"; id: WorldId }
  | { kind: "transform"; to: "human" | "spatial" }
  | { kind: "drift"; on?: boolean }
  | { kind: "hud"; on?: boolean }
  | { kind: "ask"; text: string }
  | BridgeIntent;

export type IntentSource = "voice" | "gesture" | "palette" | "model" | "mouse" | "keyboard";
