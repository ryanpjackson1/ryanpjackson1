import { MODULE_COUNT, MODULE_IDS, moduleIndex, type ModuleId } from "@/modules/registry";
import type { Command } from "./types";
import type { CommandSource, NexusState } from "@/state/types";

/**
 * Pure state transitions. No DOM, no timers, no side effects — so every
 * behaviour here is unit-tested in Node (tests/commands.test.ts).
 */
export const mod = (n: number, m: number) => ((n % m) + m) % m;

export const frontIndex = (ringIndex: number) => mod(ringIndex, MODULE_COUNT);
export const frontModule = (ringIndex: number): ModuleId => MODULE_IDS[frontIndex(ringIndex)];

/** Shortest signed number of steps to bring `target` to the front. */
export function stepsTo(ringIndex: number, target: number, n = MODULE_COUNT): number {
  let d = mod(target - frontIndex(ringIndex), n);
  if (d > n / 2) d -= n;
  return d;
}

/** Sources that may start the camera: a person pressing something. */
const USER_SOURCES: ReadonlySet<CommandSource> = new Set(["mouse", "keyboard", "launcher", "ui"]);

export function reduce(s: NexusState, c: Command, source: CommandSource = "ui"): Partial<NexusState> {
  const modal = s.openId !== null || s.launcherOpen;
  switch (c.type) {
    case "ring/rotate": {
      // The panel and launcher are modal: the ring does not move behind them.
      if (modal || !Number.isFinite(c.steps) || c.steps === 0) return {};
      return { ringIndex: s.ringIndex + Math.trunc(c.steps), selectedId: null, grabbedId: null };
    }
    case "ring/focus": {
      if (modal) return {};
      return { ringIndex: s.ringIndex + stepsTo(s.ringIndex, moduleIndex(c.id)), selectedId: c.id };
    }
    case "module/open": {
      return {
        ringIndex: s.ringIndex + stepsTo(s.ringIndex, moduleIndex(c.id)),
        selectedId: c.id,
        openId: c.id,
        launcherOpen: false,
        grabbedId: null,
        hoveredId: null,
      };
    }
    case "module/open-front": {
      if (modal) return {};
      const id = frontModule(s.ringIndex);
      return { selectedId: id, openId: id, grabbedId: null, hoveredId: null };
    }
    case "panel/close":
      return s.openId ? { openId: null } : {};
    case "card/hover":
      return modal || s.grabbedId ? {} : s.hoveredId === c.id ? {} : { hoveredId: c.id };
    case "card/grab":
      return modal ? {} : { grabbedId: c.id, hoveredId: c.id };
    case "card/release":
      // Released cards return to their orbit slot on a spring — no throwing.
      return s.grabbedId ? { grabbedId: null } : {};
    case "launcher/open":
      return s.launcherOpen ? {} : { launcherOpen: true, grabbedId: null };
    case "launcher/close":
      return s.launcherOpen ? { launcherOpen: false } : {};
    case "launcher/toggle":
      return { launcherOpen: !s.launcherOpen, grabbedId: null };
    case "escape": {
      // Innermost first: launcher → panel → held card → selection.
      if (s.launcherOpen) return { launcherOpen: false };
      if (s.openId) return { openId: null };
      if (s.grabbedId) return { grabbedId: null };
      if (s.selectedId) return { selectedId: null };
      return {};
    }
    case "motion/drift": {
      const on = c.on ?? !s.drift;
      // Reduced motion wins: drift cannot be turned on while it is active.
      if (on && s.reducedMotion) return {};
      return on === s.drift ? {} : { drift: on };
    }
    case "motion/reduced": {
      const on = c.on ?? !s.reducedMotion;
      return on ? { reducedMotion: true, drift: false } : { reducedMotion: false };
    }
    case "tracking/start": {
      if (!USER_SOURCES.has(source)) return {};
      const busy = ["requesting", "loading", "active", "no-hand"].includes(s.tracking.status);
      return busy ? {} : { tracking: { status: "requesting", message: "Waiting for camera permission…" } };
    }
    case "tracking/stop":
      return s.tracking.status === "off" ? {} : { tracking: { status: "off" }, grabbedId: null };
    case "tracking/status":
      return { tracking: c.tracking };
    case "quality/set":
      return c.tier === s.quality ? {} : { quality: c.tier };
    case "renderer/set":
      return { renderer: c.renderer, rendererReason: c.reason };
  }
}
