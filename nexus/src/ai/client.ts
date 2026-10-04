"use client";
import { memory } from "./memory";
import { buildContext } from "./context";
import { say, SentenceSplitter, interrupt, isSpeaking } from "@/voice/speech";
import { useNexus, log } from "@/stores/nexus";
import type { Intent } from "@/core/intents";
import type { ModuleId } from "@/core/modules";
import type { WorldId } from "@/render/scene/worlds";
import type { BridgeArgs, BridgeVerb } from "@/bridge/verbs";
import { holo } from "@/render/fx/holoBus";

/**
 * Streams a question to the model. Tokens appear word by word (HUD +
 * holographic text) and each completed sentence goes to the voice
 * immediately — speech begins before the response completes.
 */
let controller: AbortController | null = null;

type ActionArgs = Record<string, unknown>;

export function actionToIntent(tool: string, a: ActionArgs): Intent | null {
  switch (tool) {
    case "open_module": return { kind: "open-module", id: a.module as ModuleId };
    case "close_module": return { kind: "close" };
    case "rotate_carousel": return { kind: "rotate", dir: a.direction === "left" ? -1 : 1 };
    case "switch_world": return { kind: "world", id: a.world as WorldId };
    case "transform_form": return { kind: "transform", to: a.to === "spatial" ? "spatial" : "human" };
    case "desktop_action": {
      const verb = a.verb as BridgeVerb;
      const { verb: _v, ...rest } = a;
      void _v;
      return { kind: "bridge", verb, args: rest as unknown as BridgeArgs[typeof verb] } as Intent;
    }
  }
  return null;
}

export async function ask(text: string, onAction: (i: Intent) => Promise<void>) {
  controller?.abort();
  interrupt();
  controller = new AbortController();
  const st = useNexus.getState();
  st.set({ voice: "thinking", response: "", transcript: text });
  holo.clear();
  const history = memory.history();
  memory.user(text);
  let res: Response;
  try {
    res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, history, context: buildContext() }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    st.set({ voice: "offline" });
    log("AI · network unreachable", "warn");
    return;
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; fix?: string };
    st.set({ voice: "offline" });
    log(`AI · ${j.error ?? res.status}${j.fix ? ` — ${j.fix}` : ""}`, "warn");
    const line = j.error === "offline"
      ? "My language model isn't connected yet. Add a Gemini API key and I'll be able to answer."
      : "I couldn't reach my language model just now.";
    holo.sentence(line);
    await say(line);
    return;
  }
  const split = new SentenceSplitter();
  let full = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const emit = (s: string) => { holo.sentence(s); void say(s); };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).replace(/^data:\s*/, "");
        buf = buf.slice(i + 2);
        if (!line) continue;
        const ev = JSON.parse(line) as { type: string; text?: string; tool?: string; args?: ActionArgs; name?: string; message?: string; fix?: string };
        if (ev.type === "text" && ev.text) {
          if (useNexus.getState().voice === "thinking") useNexus.getState().set({ voice: "streaming" });
          full += ev.text;
          useNexus.getState().set({ response: full });
          split.push(ev.text, emit);
        } else if (ev.type === "action" && ev.tool) {
          const intent = actionToIntent(ev.tool, ev.args ?? {});
          if (intent) await onAction(intent);
        } else if (ev.type === "tool") {
          log(`AI · reading ${ev.name}`);
        } else if (ev.type === "error") {
          log(`AI · ${ev.message}${ev.fix ? ` — ${ev.fix}` : ""}`, "warn");
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }
  split.flush(emit);
  if (full) memory.model(full);
  const s2 = useNexus.getState();
  if (s2.voice === "streaming" || s2.voice === "thinking") s2.set({ voice: isSpeaking() ? "speaking" : s2.awake ? "listening" : "idle" });
}

export function cancelAsk() { controller?.abort(); }
