"use client";
import type { Intent, IntentSource } from "./intents";
import { MODULES } from "./modules";
import { useNexus, log } from "@/stores/nexus";
import { presentation } from "./clocks/presentation";
import { formClock } from "./clocks/form";
import { setWorld } from "@/render/scene/worldState";
import { WORLDS } from "@/render/scene/worlds";
import { formController } from "@/render/form/controller";
import { uiSound } from "@/audio/engine";
import { say } from "@/voice/speech";
import { memory } from "@/ai/memory";
import { ask } from "@/ai/client";
import { callBridge } from "@/bridge/client";
import { matchCommand, matchTransform } from "@/voice/commands";
import { parseBridgePhrase, resolvePersonalDestination } from "@/bridge/phrases";
import type { InstagramDetail } from "./details";
import { holo } from "@/render/fx/holoBus";

/**
 * The orchestrator. Voice (local matcher + model tool calls), gestures and
 * the ⌘K palette all produce Intents and land here. Nothing else changes
 * high-level state.
 */
const TRANSFORM_LINE = "Understood. Give me a moment.";
const MAX_PANELS = 2;

// The presentation clock commits the open at the end of APPROACH (or on cancel).
presentation.onCommit = (id) => {
  useNexus.getState().set({ expanded: id, focused: id });
};
formController.setSpeaker(async (text, opts) => {
  if (opts?.record) memory.model(text);
  holo.sentence(text);
  await say(text);
});

function speakOut(text: string, record = true) {
  if (record) memory.model(text);
  holo.sentence(text);
  return say(text);
}

export async function dispatch(intent: Intent, source: IntentSource): Promise<void> {
  const st = useNexus.getState();
  const embodied = formClock.engaged;

  switch (intent.kind) {
    case "open-module": {
      if (embodied) return dispatch({ kind: "present-module", id: intent.id }, source);
      if (presentation.id === intent.id && st.expanded === intent.id) return;
      st.goTo(intent.id);
      st.set({ selected: intent.id, hovered: null, dragging: null });
      presentation.start(intent.id);
      uiSound("open");
      log(`OPEN · ${MODULES[intent.id].label} (${source})`);
      return;
    }
    case "present-module": {
      // While embodied there is no ring: modules are PRESENTED beside the figure.
      const cur = st.embodiedPanels.filter((p) => p !== intent.id);
      const next = [...cur, intent.id].slice(-MAX_PANELS);
      st.set({ embodiedPanels: next });
      uiSound("open");
      log(`PRESENT · ${MODULES[intent.id].label}`);
      return;
    }
    case "close": {
      if (embodied) {
        if (st.embodiedPanels.length) st.set({ embodiedPanels: st.embodiedPanels.slice(0, -1) });
        return;
      }
      if (presentation.id || st.expanded) {
        presentation.close();
        st.set({ expanded: null, focused: null, selected: null });
        uiSound("close");
      }
      return;
    }
    case "rotate": {
      if (embodied) {
        // "Rotate" is refused — there is no ring.
        if (source !== "gesture") await speakOut("There's no ring while I'm in this form. Ask me to return to spatial mode first.");
        return;
      }
      if (presentation.id) {
        presentation.cancelAndCommit();
        presentation.close();
        st.set({ expanded: null, focused: null, selected: null });
      }
      // Rotating LEFT carries the cards to the left: the next card arrives from the right.
      st.rotate(intent.dir === -1 ? 1 : -1);
      uiSound("swipe");
      return;
    }
    case "world": {
      setWorld(intent.id);
      st.set({ world: intent.id });
      uiSound("confirm");
      log(`WORLD · ${WORLDS[intent.id].name}`);
      return;
    }
    case "transform": {
      if (intent.to === "human") {
        if (formClock.embodied) return;
        await formController.toHuman();
      } else {
        formController.toSpatial();
      }
      return;
    }
    case "drift": {
      const on = intent.on ?? !st.driftEnabled;
      st.set({ driftEnabled: on });
      uiSound(on ? "unfreeze" : "freeze");
      log(on ? "MOTION · drift — ambient motion on" : "MOTION · locked — the room holds still");
      return;
    }
    case "hud": {
      st.set({ hudVisible: intent.on ?? !st.hudVisible });
      return;
    }
    case "ask": {
      await ask(intent.text, (i) => dispatch(i, "model"));
      return;
    }
    case "bridge": {
      log(`BRIDGE · ${intent.verb}`);
      const r = await callBridge(intent.verb, intent.args as never);
      if (r.ok) {
        uiSound("confirm");
        log(`BRIDGE · ${r.message}`, "ok");
        if (source === "voice") await speakOut(r.message);
      } else {
        uiSound("error");
        log(`BRIDGE · ${r.message}${r.fix ? ` — ${r.fix}` : ""}`, "warn");
        if (source === "voice" || source === "palette") await speakOut(r.fix ? `${r.message} ${r.fix}` : r.message);
      }
      return;
    }
  }
}

/** A spoken (or typed) utterance: local matchers first, then the model. */
export async function handleUtterance(text: string, source: IntentSource = "voice") {
  const st = useNexus.getState();
  // The transformation acts within a breath — no network round-trip.
  const tf = matchTransform(text);
  if (tf) {
    if (tf === "human") {
      memory.exchange(text, TRANSFORM_LINE);
      holo.sentence(TRANSFORM_LINE);
      void say(TRANSFORM_LINE);
    } else {
      memory.exchange(text, "Returning to spatial mode.");
      void say("Returning.");
    }
    return dispatch({ kind: "transform", to: tf }, source);
  }
  const ig = st.payloads.instagram?.detail as InstagramDetail | undefined;
  const bridge = parseBridgePhrase(text, { instagram: ig ?? null });
  const local = matchCommand(text);
  if (local && !(bridge && bridge.verb === "launch" && local.kind === "open-module" && /spotify/i.test(text))) {
    memory.user(text);
    return dispatch(local, source);
  }
  if (bridge) {
    memory.user(text);
    return dispatch(bridge, source);
  }
  const personal = resolvePersonalDestination(text, { instagram: ig ?? null });
  if (personal) {
    memory.user(text);
    if ("error" in personal) return void speakOut(personal.error);
    return dispatch({ kind: "bridge", verb: "open-url", args: { url: personal.url } }, source);
  }
  return dispatch({ kind: "ask", text }, source);
}
