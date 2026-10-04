/**
 * Desktop bridge verb contract — shared by client and server, no Node imports.
 *
 * Verbs are a closed enum. The server's implementation table is typed as
 * `{ [V in BridgeVerb]: Impl<V> }`, so adding a verb here without writing
 * its hand-written implementation is a compile error. There is deliberately
 * no shutdown, restart, kill or delete verb: a misheard word must never be
 * able to destroy unsaved work.
 */
export const BRIDGE_VERBS = [
  "launch",
  "open-url",
  "media",
  "volume",
  "screenshot",
  "clipboard-read",
  "clipboard-write",
  "hide-others",
  "quit",
  "lock",
  "sleep-display",
  "dnd",
  "note",
  "reminder",
] as const;

export type BridgeVerb = (typeof BRIDGE_VERBS)[number];

export type MediaAction = "play" | "pause" | "toggle" | "next" | "previous";

export interface BridgeArgs {
  launch: { app: string };
  "open-url": { url: string; /** display name or index; default = a non-primary display if present */ display?: string };
  media: { action: MediaAction };
  volume: { level?: number; delta?: number; mute?: boolean };
  screenshot: Record<string, never>;
  "clipboard-read": Record<string, never>;
  "clipboard-write": { text: string };
  "hide-others": Record<string, never>;
  quit: { app: string };
  lock: Record<string, never>;
  "sleep-display": Record<string, never>;
  dnd: { on: boolean };
  note: { title: string; body: string };
  reminder: { title: string; due?: string };
}

export interface BridgeResult {
  ok: boolean;
  /** One human sentence, safe to speak aloud. */
  message: string;
  /** When !ok: the exact thing to change, e.g. a System Settings path. */
  fix?: string;
  data?: unknown;
}

export interface InstalledApp {
  name: string;   // display name, e.g. "Spotify"
  path: string;   // /Applications/Spotify.app
}

export interface DisplayInfo {
  index: number;
  name: string;         // real macOS name, e.g. "LG ULTRAWIDE"
  spoken: string;       // "on your LG ULTRAWIDE" / "on your laptop"
  primary: boolean;
  builtin: boolean;
  /** AppleScript/Carbon bounds: top-left origin, Y down. */
  bounds: { left: number; top: number; right: number; bottom: number };
}

export const isBridgeVerb = (v: unknown): v is BridgeVerb =>
  typeof v === "string" && (BRIDGE_VERBS as readonly string[]).includes(v);
