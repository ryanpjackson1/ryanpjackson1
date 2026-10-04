"use client";
import { useNexus, log } from "@/stores/nexus";
import { interrupt, isSpeaking } from "./speech";
import { rt, nowS } from "@/core/runtime";
import { uiSound } from "@/audio/engine";

/**
 * Listening. Continuous Web Speech recognition with:
 *  · wake phrase "Nexus" (or the circle gesture → wake())
 *  · barge-in: if the user speaks while NEXUS speaks, NEXUS stops at once
 *  · an awake window that closes after silence
 */
type SR = {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
};

const WAKE = /\b(nexus|next us|nexis|lexus)\b/i;
const AWAKE_WINDOW = 9; // seconds of silence before NEXUS goes back to sleep

let rec: SR | null = null;
let wanted = false;
let awakeUntil = 0;
let handler: ((text: string) => void) | null = null;

export const speechSupported = () =>
  typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

/** Wake NEXUS: whole interface glows, a wave spreads, the mic appears. */
export function wake(source: "voice" | "gesture" | "keyboard") {
  const st = useNexus.getState();
  awakeUntil = nowS() + AWAKE_WINDOW;
  rt.wakeAt = nowS();
  if (!st.awake) {
    uiSound("wake");
    log(`WAKE · ${source}`, "ok");
  }
  interrupt();
  st.set({ awake: true, voice: rec ? "listening" : st.voice });
}

export function sleep() {
  awakeUntil = 0;
  const st = useNexus.getState();
  if (st.awake) st.set({ awake: false, voice: rec ? "idle" : st.voice === "offline" ? "offline" : "idle" });
}

export function onCommand(fn: (text: string) => void) { handler = fn; }

export function startListening(): boolean {
  const Ctor = ((window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition);
  if (!Ctor) {
    log("VOICE · speech recognition not supported in this browser (use Chrome/Edge/Safari)", "warn");
    useNexus.getState().set({ voice: "offline" });
    return false;
  }
  wanted = true;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = navigator.language || "en-US";
  r.maxAlternatives = 1;

  r.onspeechstart = () => {
    // barge-in: the user speaks while NEXUS speaks → stop immediately
    if (isSpeaking() && useNexus.getState().awake) interrupt();
  };

  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0].transcript.trim();
      if (!text) continue;
      const st = useNexus.getState();
      const hasWake = WAKE.test(text);
      if (!res.isFinal) {
        if (hasWake && !st.awake) wake("voice");
        if (st.awake) {
          awakeUntil = nowS() + AWAKE_WINDOW;
          if (isSpeaking() && text.split(" ").length >= 2) interrupt();
          st.set({ transcript: text });
        }
        continue;
      }
      if (hasWake && !st.awake) wake("voice");
      if (!useNexus.getState().awake) continue;
      // strip the wake word; what remains is the command
      const cmd = hasWake ? text.replace(/^.*?\b(nexus|next us|nexis|lexus)\b[,.!?\s]*/i, "").trim() : text;
      useNexus.getState().set({ transcript: cmd || text });
      awakeUntil = nowS() + AWAKE_WINDOW;
      if (cmd && handler) handler(cmd);
    }
  };

  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      wanted = false;
      useNexus.getState().set({ voice: "offline" });
      log("VOICE · microphone permission denied — allow it in the browser's site settings", "warn");
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      log(`VOICE · ${e.error}`, "warn");
    }
  };
  r.onend = () => {
    // Chrome ends sessions periodically; keep listening while wanted
    if (wanted) window.setTimeout(() => { try { r.start(); } catch { /* already started */ } }, 250);
  };
  try { r.start(); } catch { /* ignore */ }
  rec = r;
  useNexus.getState().set({ voice: "idle" });
  log("VOICE · listening for “Nexus”", "ok");
  return true;
}

export function stopListening() {
  wanted = false;
  rec?.abort();
  rec = null;
  useNexus.getState().set({ voice: "offline", awake: false });
}

/** Per frame: close the awake window after silence. */
export function recognitionFrame() {
  if (awakeUntil && nowS() > awakeUntil && !isSpeaking()) {
    const st = useNexus.getState();
    if (st.voice !== "thinking" && st.voice !== "streaming") sleep();
  }
}
