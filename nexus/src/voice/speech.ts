"use client";
import { audioCtx, voiceBus, voiceLevel, initAudio } from "@/audio/engine";
import { InferredLevel } from "./level";
import { useNexus } from "@/stores/nexus";
import { rt } from "@/core/runtime";

/**
 * Speech output. Studio voice (Gemini TTS, through the spatial voice bus
 * + analyser) when available; the local synthesiser otherwise. Sentences
 * are queued as they stream in, so speech begins before the response is
 * complete. Everything stops IMMEDIATELY on interrupt().
 */
type Mode = "studio" | "local";
let mode: Mode = "studio";
let studioFailures = 0;
const queue: { text: string; resolve: () => void }[] = [];
let speaking = false;
let current: { stop: () => void } | null = null;
let generation = 0;
const inferred = new InferredLevel();
let localActive = false;

export const isSpeaking = () => speaking;

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = speechSynthesis.getVoices();
  const pref = ["Samantha (Enhanced)", "Daniel (Enhanced)", "Google UK English Female", "Google US English", "Microsoft Aria Online", "Samantha", "Daniel", "Karen"];
  for (const p of pref) { const v = vs.find((x) => x.name.startsWith(p)); if (v) return v; }
  return vs.find((v) => v.lang.startsWith("en") && v.localService) ?? vs.find((v) => v.lang.startsWith("en")) ?? null;
}

function speakLocal(text: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = 0.96;
    let gotBoundary = false;
    const now = () => performance.now() / 1000;
    u.onstart = () => {
      localActive = true;
      // if the voice reports no boundaries within 350 ms, fall back to a generic cadence
      window.setTimeout(() => { if (!gotBoundary && localActive && gen === generation) inferred.cadence(now()); }, 350);
    };
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      gotBoundary = true;
      const len = e.charLength || (text.slice(e.charIndex).match(/^\S+/)?.[0].length ?? 4);
      inferred.word(text.substr(e.charIndex, len), now());
    };
    const done = () => { localActive = false; inferred.stop(); resolve(); };
    u.onend = done;
    u.onerror = done;
    current = { stop: () => { speechSynthesis.cancel(); done(); } };
    speechSynthesis.speak(u);
  });
}

async function speakStudio(text: string, gen: number): Promise<boolean> {
  const ctx = audioCtx() ?? initAudio();
  const bus = voiceBus();
  if (!ctx || !bus) return false;
  const r = await fetch("/api/ai/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
  if (!r || !r.ok) return false;
  const { audio, sampleRate } = (await r.json()) as { audio: string; sampleRate: number };
  if (gen !== generation) return true; // interrupted while fetching
  const bin = atob(audio);
  const n = bin.length >> 1;
  const buf = ctx.createBuffer(1, n, sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let s = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    if (s & 0x8000) s -= 0x10000;
    ch[i] = s / 32768;
  }
  await new Promise<void>((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(bus);
    src.onended = () => resolve();
    current = { stop: () => { try { src.stop(); } catch { /* already stopped */ } resolve(); } };
    src.start();
  });
  return true;
}

async function pump() {
  if (speaking) return;
  speaking = true;
  const gen = generation;
  useNexus.getState().set({ voice: "speaking" });
  while (queue.length && gen === generation) {
    const item = queue.shift()!;
    let ok = false;
    if (mode === "studio") {
      ok = await speakStudio(item.text, gen);
      if (!ok && ++studioFailures >= 2) mode = "local";
    }
    if (!ok && gen === generation) await speakLocal(item.text, gen);
    item.resolve();
  }
  speaking = false;
  current = null;
  if (gen === generation) {
    const st = useNexus.getState();
    if (st.voice === "speaking") st.set({ voice: st.awake ? "listening" : "idle" });
  }
}

/** Queue a sentence. Resolves when it has been spoken (or interrupted). */
export function say(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return Promise.resolve();
  return new Promise((resolve) => {
    queue.push({ text: t, resolve });
    void pump();
  });
}

/** The user spoke over NEXUS: stop now. */
export function interrupt() {
  if (!speaking && !queue.length) return false;
  generation++;
  queue.splice(0).forEach((q) => q.resolve());
  current?.stop();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  inferred.stop();
  speaking = false;
  useNexus.getState().set({ voice: "interrupted" });
  return true;
}

/** Per frame: publish the active voice level to rt.speech. Silence is exactly 0. */
export function speechFrame() {
  const t = performance.now() / 1000;
  const studio = voiceLevel();
  const local = localActive ? inferred.level(t) : 0;
  const v = speaking ? Math.max(studio, local) : 0;
  rt.speech = v < 0.02 ? 0 : v;
}

export function forceLocalVoice() { mode = "local"; }

/**
 * Drive the local-voice level path exactly as the synthesiser's boundary
 * events do, without audio — used by verification (headless browsers have
 * no voices) to prove the mouth follows the local voice.
 */
export async function simulateLocalSpeech(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  speaking = true;
  localActive = true;
  const t0 = performance.now() / 1000;
  let t = t0;
  for (const w of words) {
    inferred.word(w, t);
    t += Math.max(1, Math.round(w.length / 3)) / 5 + 0.06;
  }
  await new Promise((r) => setTimeout(r, (t - t0) * 1000 + 200));
  localActive = false;
  speaking = false;
  inferred.stop();
}

/**
 * Splits a token stream into sentences as they complete. A sentence ends
 * at . ! ? (plus closing quotes/brackets) FOLLOWED BY WHITESPACE, or at a
 * newline — so "2.4%" and "e.g." mid-stream never cut a sentence short.
 */
export class SentenceSplitter {
  private buf = "";
  push(chunk: string, emit: (s: string) => void) {
    this.buf += chunk;
    let start = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      let end = -1;
      if (c === "\n") end = i;
      else if (c === "." || c === "!" || c === "?") {
        let j = i + 1;
        while (j < this.buf.length && /[.!?"')\]]/.test(this.buf[j])) j++;
        if (j < this.buf.length && /\s/.test(this.buf[j])) end = j;
        else continue;
      } else continue;
      const sentence = this.buf.slice(start, end).trim();
      if (sentence) emit(sentence);
      start = end + 1;
      i = end;
    }
    this.buf = this.buf.slice(start);
  }
  flush(emit: (s: string) => void) {
    const s = this.buf.trim();
    this.buf = "";
    if (s) emit(s);
  }
}
