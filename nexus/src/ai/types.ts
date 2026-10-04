import type { Command } from "@/commands/types";
import type { ModuleId } from "@/modules/registry";

/**
 * Provider-neutral AI boundary — TYPES ONLY in this milestone.
 *
 * Nothing here calls a model. Later, an OpenAI adapter and an Anthropic
 * adapter will each implement `AIProvider`, running SERVER-SIDE (API keys
 * never reach the browser) behind a route such as /api/ai. Whatever the
 * provider, its output reaches the app the same way every other input does:
 * as Commands, validated by `validateAICommand` and sent through
 * `dispatch(command, "ai")`.
 */
export type AIProviderId = "openai" | "anthropic";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/** What the interface can tell a model about the current state. */
export interface AIContext {
  frontModule: ModuleId;
  openModule: ModuleId | null;
  /** Panels show demo data in this milestone; the model must be told so. */
  dataIsDemo: boolean;
}

export interface AIRequest {
  messages: AIMessage[];
  context: AIContext;
  /** Command types the model may emit (see AI_COMMAND_ALLOWLIST). */
  tools: readonly AICommandType[];
}

/** Streamed events — identical shape for every provider. */
export type AIEvent =
  | { type: "text-delta"; text: string }
  | { type: "command"; command: Command }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AIProvider {
  readonly id: AIProviderId;
  readonly label: string;
  /** True when the server has credentials for this provider. */
  isConfigured(): Promise<boolean>;
  stream(request: AIRequest, signal: AbortSignal): AsyncIterable<AIEvent>;
}

/**
 * Commands a model is allowed to issue. Deliberately excludes
 * tracking/start (the camera only starts on an explicit user action),
 * renderer/quality changes and internal status commands.
 */
export const AI_COMMAND_ALLOWLIST = [
  "ring/rotate",
  "ring/focus",
  "module/open",
  "module/open-front",
  "panel/close",
  "motion/drift",
] as const satisfies readonly Command["type"][];

export type AICommandType = (typeof AI_COMMAND_ALLOWLIST)[number];
