import { reduce } from "./reducer";
import type { Command, CommandOf, CommandType } from "./types";
import type { CommandSource, NexusState } from "@/state/types";

/**
 * dispatch(command, source) — the ONLY way state changes.
 *
 *   1. the pure reducer computes the next state
 *   2. the store applies it and records the last command
 *   3. effects registered for that command type run (camera start/stop, …)
 *
 * The store is injected so this module stays framework-free and testable.
 */
export interface StoreLike {
  getState(): NexusState;
  setState(p: Partial<NexusState>): void;
}

type Effect<T extends CommandType> = (cmd: CommandOf<T>, source: CommandSource, prev: NexusState, next: NexusState) => void;
const effects = new Map<CommandType, Set<Effect<CommandType>>>();
const listeners = new Set<(cmd: Command, source: CommandSource) => void>();

let store: StoreLike | null = null;
export function bindStore(s: StoreLike) { store = s; }

/** Register a side effect for a command type. Returns an unsubscribe function. */
export function onCommand<T extends CommandType>(type: T, fn: Effect<T>): () => void {
  if (!effects.has(type)) effects.set(type, new Set());
  const set = effects.get(type)!;
  set.add(fn as unknown as Effect<CommandType>);
  return () => { set.delete(fn as unknown as Effect<CommandType>); };
}

/** Observe every command (used by the HUD and by tests). */
export function observeCommands(fn: (cmd: Command, source: CommandSource) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function dispatch(cmd: Command, source: CommandSource): void {
  if (!store) throw new Error("dispatch() called before bindStore()");
  const prev = store.getState();
  const patch = reduce(prev, cmd, source);
  // Hover churn is high-frequency; don't let it overwrite the HUD's last command.
  const record = cmd.type !== "card/hover" && cmd.type !== "quality/set";
  store.setState(record ? { ...patch, lastCommand: { type: cmd.type, source, at: Date.now() } } : patch);
  const next = store.getState();
  effects.get(cmd.type)?.forEach((fn) => fn(cmd, source, prev, next));
  listeners.forEach((fn) => fn(cmd, source));
}
