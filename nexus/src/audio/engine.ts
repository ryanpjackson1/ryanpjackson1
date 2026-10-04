"use client";
import { rt } from "@/core/runtime";

/**
 * Ambient audio. No samples: everything is synthesised so nothing has to
 * load. A very quiet synth pad, soft UI sounds, gesture confirmations, and
 * a spatial voice bus (panner + analyser) the speech layer plays into.
 */
export type UiSound =
  | "hover" | "select" | "open" | "close" | "swipe" | "grab" | "drop"
  | "confirm" | "wake" | "error" | "freeze" | "unfreeze" | "boot" | "transform" | "tick";

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  ui: GainNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
  reverb: ConvolverNode;
  voiceIn: GainNode;
  voicePanner: PannerNode;
  analyser: AnalyserNode;
  analyserBuf: Uint8Array<ArrayBuffer>;
  padOscs: OscillatorNode[];
}

let E: Engine | null = null;
let muted = false;

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Must be called from a user gesture (boot "Enter"). Idempotent. */
export function initAudio(): AudioContext | null {
  if (E) { void E.ctx.resume(); return E.ctx; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC({ latencyHint: "interactive" });
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.2, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet).connect(master);

  const ui = ctx.createGain();
  ui.gain.value = 0.32;
  ui.connect(master);
  ui.connect(reverb);

  // ── pad: detuned saws/triangles → lowpass, breathing LFO ────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 520;
  padFilter.Q.value = 0.6;
  padFilter.connect(padGain);
  padGain.connect(master);
  padGain.connect(reverb);
  const notes = [55, 82.41, 110, 164.81, 207.65]; // A1 E2 A2 E3 G#3 — open, unresolved
  const padOscs: OscillatorNode[] = [];
  notes.forEach((f, i) => {
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = i < 2 ? "triangle" : "sawtooth";
      o.frequency.value = f;
      o.detune.value = det + (i * 3) % 5;
      const g = ctx.createGain();
      g.gain.value = (i < 2 ? 0.05 : 0.016) / 2;
      o.connect(g).connect(padFilter);
      o.start();
      padOscs.push(o);
    }
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 180;
  lfo.connect(lfoG).connect(padFilter.frequency);
  lfo.start();
  padGain.gain.setTargetAtTime(0.22, ctx.currentTime + 0.3, 2.5);

  // ── voice bus: in → analyser → HRTF panner → master ──────────────────
  const voiceIn = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const voicePanner = new PannerNode(ctx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    refDistance: 1,
    maxDistance: 20,
    rolloffFactor: 1,
    positionX: 0, positionY: 0, positionZ: -1,
  });
  voiceIn.connect(analyser);
  analyser.connect(voicePanner);
  voicePanner.connect(master);
  const vr = ctx.createGain();
  vr.gain.value = 0.12;
  voicePanner.connect(vr).connect(reverb);

  E = { ctx, master, ui, padGain, padFilter, reverb, voiceIn, voicePanner, analyser, analyserBuf: new Uint8Array(new ArrayBuffer(analyser.fftSize)), padOscs };
  return ctx;
}

export const audioCtx = () => E?.ctx ?? null;
export const voiceBus = () => E?.voiceIn ?? null;

export function setMuted(m: boolean) {
  muted = m;
  if (E) E.master.gain.setTargetAtTime(m ? 0 : 0.9, E.ctx.currentTime, 0.15);
}

/** RMS of the studio voice, 0..1, scaled to match the inferred local level. */
export function voiceLevel(): number {
  if (!E) return 0;
  E.analyser.getByteTimeDomainData(E.analyserBuf);
  let sum = 0;
  for (let i = 0; i < E.analyserBuf.length; i++) {
    const v = (E.analyserBuf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / E.analyserBuf.length);
  return Math.min(1, rms * 4.2);
}

/**
 * Place the voice. In spatial mode it comes from the centre; embodied it
 * relocates to the face — in DIRECTION only. Distance is capped because
 * the panner attenuates with distance (a head 4 m away halved the voice).
 */
export function placeVoice(x: number, y: number, z: number) {
  if (!E) return;
  const len = Math.hypot(x, y, z) || 1;
  const d = Math.min(len, 1.0);
  const t = E.ctx.currentTime;
  E.voicePanner.positionX.setTargetAtTime((x / len) * d, t, 0.2);
  E.voicePanner.positionY.setTargetAtTime((y / len) * d, t, 0.2);
  E.voicePanner.positionZ.setTargetAtTime((z / len) * d, t, 0.2);
}

/** Called every frame: pad and UI react to speech + room state. */
export function audioFrame(dim: number) {
  if (!E) return;
  const t = E.ctx.currentTime;
  const s = rt.speech;
  E.padFilter.frequency.setTargetAtTime(480 + s * 900 + dim * -200, t, 0.08);
  E.padGain.gain.setTargetAtTime(0.22 * (1 - s * 0.45), t, 0.12);
}

function env(g: GainNode, t: number, a: number, peak: number, r: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
}

function blip(freq: number, type: OscillatorType, a: number, peak: number, r: number, glideTo?: number, delay = 0) {
  if (!E || muted) return;
  const t = E.ctx.currentTime + delay;
  const o = E.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + a + r);
  const g = E.ctx.createGain();
  env(g, t, a, peak, r);
  o.connect(g).connect(E.ui);
  o.start(t);
  o.stop(t + a + r + 0.05);
}

function noise(dur: number, from: number, to: number, peak: number, delay = 0) {
  if (!E || muted) return;
  const t = E.ctx.currentTime + delay;
  const len = Math.floor(E.ctx.sampleRate * dur);
  const buf = E.ctx.createBuffer(1, len, E.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = E.ctx.createBufferSource();
  src.buffer = buf;
  const f = E.ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = E.ctx.createGain();
  env(g, t, dur * 0.35, peak, dur * 0.65);
  src.connect(f).connect(g).connect(E.ui);
  src.start(t);
}

let lastHover = 0;
export function uiSound(kind: UiSound) {
  if (!E || muted) return;
  switch (kind) {
    case "hover": {
      const now = performance.now();
      if (now - lastHover < 70) return;
      lastHover = now;
      blip(2400, "sine", 0.004, 0.035, 0.06);
      return;
    }
    case "tick": return blip(3200, "square", 0.002, 0.012, 0.025);
    case "select": blip(880, "sine", 0.005, 0.12, 0.18); return blip(1320, "sine", 0.005, 0.07, 0.25, undefined, 0.05);
    case "open": noise(0.55, 400, 3200, 0.1); return blip(660, "triangle", 0.02, 0.09, 0.6, 990);
    case "close": noise(0.45, 2800, 300, 0.08); return blip(880, "triangle", 0.01, 0.07, 0.4, 520);
    case "swipe": return noise(0.32, 900, 4200, 0.12);
    case "grab": return blip(320, "sine", 0.004, 0.16, 0.12, 480);
    case "drop": return blip(520, "sine", 0.004, 0.12, 0.3, 300);
    case "confirm": blip(1046, "sine", 0.004, 0.1, 0.14); return blip(1568, "sine", 0.004, 0.08, 0.3, undefined, 0.07);
    case "wake": noise(1.2, 200, 2400, 0.08); blip(440, "sine", 0.08, 0.1, 1.2, 880); return blip(660, "sine", 0.1, 0.06, 1.4, 1320, 0.1);
    case "error": blip(260, "square", 0.005, 0.05, 0.12); return blip(220, "square", 0.005, 0.05, 0.16, undefined, 0.13);
    case "freeze": return blip(1800, "sine", 0.01, 0.06, 0.5, 900);
    case "unfreeze": return blip(900, "sine", 0.01, 0.06, 0.4, 1800);
    case "boot": noise(2.2, 120, 1800, 0.06); return blip(110, "sine", 0.6, 0.14, 2.4, 220);
    case "transform": noise(3.0, 3000, 120, 0.09); return blip(220, "sine", 0.4, 0.12, 3.2, 55);
  }
}
