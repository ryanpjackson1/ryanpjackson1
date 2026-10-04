import { describe, it, expect, beforeEach } from "vitest";
import { reduce, stepsTo, frontModule } from "@/commands/reducer";
import { dispatch, bindStore, onCommand, observeCommands } from "@/commands/dispatch";
import { INITIAL_STATE, type NexusState, type CommandSource } from "@/state/types";
import type { Command } from "@/commands/types";
import { MODULE_IDS } from "@/modules/registry";

/** A tiny in-memory store so dispatch() runs exactly as in the app. */
let state: NexusState;
beforeEach(() => {
  state = { ...INITIAL_STATE };
  bindStore({ getState: () => state, setState: (p) => { state = { ...state, ...p }; } });
});
const run = (c: Command, src: CommandSource = "keyboard") => dispatch(c, src);

describe("defaults", () => {
  it("starts locked (no drift), closed, and with the camera off", () => {
    expect(INITIAL_STATE.drift).toBe(false);
    expect(INITIAL_STATE.openId).toBeNull();
    expect(INITIAL_STATE.launcherOpen).toBe(false);
    expect(INITIAL_STATE.tracking.status).toBe("off");
  });
});

describe("ring", () => {
  it("rotates and wraps the front module", () => {
    run({ type: "ring/rotate", steps: -1 });
    expect(state.ringIndex).toBe(-1);
    expect(frontModule(state.ringIndex)).toBe("system");
    run({ type: "ring/rotate", steps: 12 });
    expect(frontModule(state.ringIndex)).toBe("stocks");
  });
  it("takes the shortest path to a module", () => {
    expect(stepsTo(0, 9)).toBe(-1);
    expect(stepsTo(0, 3)).toBe(3);
    expect(stepsTo(0, 5)).toBe(5);
    expect(stepsTo(-1, 0)).toBe(1);
  });
  it("does not move behind a modal panel or launcher", () => {
    run({ type: "module/open", id: "news" });
    const idx = state.ringIndex;
    run({ type: "ring/rotate", steps: 1 });
    expect(state.ringIndex).toBe(idx);
    run({ type: "panel/close" });
    run({ type: "launcher/open" });
    run({ type: "ring/rotate", steps: 1 });
    expect(state.ringIndex).toBe(idx);
  });
  it("ignores zero and non-finite steps", () => {
    run({ type: "ring/rotate", steps: 0 });
    run({ type: "ring/rotate", steps: Number.NaN });
    expect(state.ringIndex).toBe(0);
  });
});

describe("panel", () => {
  it("opening a module brings it to the front, selects it and opens the panel", () => {
    run({ type: "module/open", id: "weather" }, "mouse");
    expect(state.openId).toBe("weather");
    expect(state.selectedId).toBe("weather");
    expect(frontModule(state.ringIndex)).toBe("weather");
  });
  it("Enter opens the front card", () => {
    run({ type: "ring/rotate", steps: 2 });
    run({ type: "module/open-front" });
    expect(state.openId).toBe(MODULE_IDS[2]);
  });
  it("opening from the launcher closes the launcher", () => {
    run({ type: "launcher/open" });
    run({ type: "module/open", id: "music" }, "launcher");
    expect(state.launcherOpen).toBe(false);
    expect(state.openId).toBe("music");
  });
});

describe("escape closes the innermost layer first", () => {
  it("launcher → panel → held card → selection", () => {
    run({ type: "module/open", id: "ai" });
    run({ type: "launcher/open" });
    run({ type: "escape" });
    expect(state.launcherOpen).toBe(false);
    expect(state.openId).toBe("ai");
    run({ type: "escape" });
    expect(state.openId).toBeNull();
    expect(state.selectedId).toBe("ai");
    run({ type: "card/grab", id: "ai" }, "mouse");
    run({ type: "escape" });
    expect(state.grabbedId).toBeNull();
    run({ type: "escape" });
    expect(state.selectedId).toBeNull();
    const before = { ...state };
    run({ type: "escape" });
    expect({ ...state, lastCommand: null }).toEqual({ ...before, lastCommand: null });
  });
});

describe("cards", () => {
  it("a released card has no held state left (it springs back to its slot)", () => {
    run({ type: "card/grab", id: "stocks" }, "mouse");
    expect(state.grabbedId).toBe("stocks");
    run({ type: "card/release" }, "mouse");
    expect(state.grabbedId).toBeNull();
  });
  it("cannot grab behind a modal", () => {
    run({ type: "module/open", id: "news" });
    run({ type: "card/grab", id: "stocks" }, "mouse");
    expect(state.grabbedId).toBeNull();
  });
});

describe("motion", () => {
  it("drift toggles and LOCKED is the default", () => {
    run({ type: "motion/drift" });
    expect(state.drift).toBe(true);
    run({ type: "motion/drift" });
    expect(state.drift).toBe(false);
  });
  it("reduced motion turns drift off and keeps it off", () => {
    run({ type: "motion/drift", on: true });
    run({ type: "motion/reduced", on: true }, "system");
    expect(state.drift).toBe(false);
    run({ type: "motion/drift", on: true });
    expect(state.drift).toBe(false);
    run({ type: "motion/reduced", on: false }, "system");
    run({ type: "motion/drift", on: true });
    expect(state.drift).toBe(true);
  });
});

describe("camera activation is explicit", () => {
  it("starts only from a person's action", () => {
    for (const src of ["system", "gesture", "ai"] as const) {
      run({ type: "tracking/start" }, src);
      expect(state.tracking.status).toBe("off");
    }
    run({ type: "tracking/start" }, "ui");
    expect(state.tracking.status).toBe("requesting");
  });
  it("does not restart while already running, and stops cleanly", () => {
    run({ type: "tracking/start" }, "launcher");
    run({ type: "tracking/status", tracking: { status: "active" } }, "system");
    run({ type: "tracking/start" }, "ui");
    expect(state.tracking.status).toBe("active");
    run({ type: "tracking/stop" }, "ui");
    expect(state.tracking.status).toBe("off");
  });
  it("can retry after an error", () => {
    run({ type: "tracking/status", tracking: { status: "denied", message: "x" } }, "system");
    run({ type: "tracking/start" }, "ui");
    expect(state.tracking.status).toBe("requesting");
  });
});

describe("one command layer", () => {
  it("every source goes through dispatch and is recorded", () => {
    const seen: string[] = [];
    const off = observeCommands((c, s) => seen.push(`${s}:${c.type}`));
    run({ type: "ring/rotate", steps: 1 }, "gesture");
    run({ type: "launcher/toggle" }, "keyboard");
    run({ type: "launcher/close" }, "launcher");
    off();
    expect(seen).toEqual(["gesture:ring/rotate", "keyboard:launcher/toggle", "launcher:launcher/close"]);
    expect(state.lastCommand).toMatchObject({ type: "launcher/close", source: "launcher" });
  });
  it("effects see the previous and next state", () => {
    let fired = 0;
    const off = onCommand("tracking/start", (_c, _s, prev, next) => { if (prev.tracking.status === "off" && next.tracking.status === "requesting") fired++; });
    run({ type: "tracking/start" }, "ui");
    off();
    expect(fired).toBe(1);
  });
  it("the reducer is pure", () => {
    const s0 = { ...INITIAL_STATE };
    const copy = JSON.stringify(s0);
    reduce(s0, { type: "module/open", id: "news" });
    expect(JSON.stringify(s0)).toBe(copy);
  });
});
