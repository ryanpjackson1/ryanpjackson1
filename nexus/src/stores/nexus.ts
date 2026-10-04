"use client";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { MODULE_IDS, type ModuleId } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import type { WorldId } from "@/render/scene/worlds";

export type CardState = "idle" | "hovered" | "selected" | "expanded" | "focused" | "dragging";
export type TrackingStatus = "off" | "loading" | "active" | "no-hand" | "denied" | "error";
export type VoiceStatus = "offline" | "idle" | "listening" | "thinking" | "streaming" | "speaking" | "interrupted";
export type FormMode = "spatial" | "human";
export type LogLevel = "info" | "ok" | "warn";

export interface LogLine { t: number; msg: string; level: LogLevel }
export interface GestureReading { name: string; confidence: number; at: number; hands: number }

interface NexusState {
  // boot
  booted: boolean;
  // ring
  ringIndex: number;           // integer slot the orbit spring is heading to
  hovered: ModuleId | null;
  selected: ModuleId | null;
  expanded: ModuleId | null;   // detail panel open
  focused: ModuleId | null;    // centred + presented (master-clock sequence in flight / done)
  dragging: ModuleId | null;
  multiSelect: ModuleId[];
  frozen: boolean;             // palm held still
  // stillness (Phase 6) — ambient drift OFF by default
  driftEnabled: boolean;
  // world
  world: WorldId;
  hudVisible: boolean;
  paletteOpen: boolean;
  soundOn: boolean;
  // tracking
  tracking: TrackingStatus;
  gesture: GestureReading;
  // voice / ai
  voice: VoiceStatus;
  awake: boolean;
  transcript: string;
  response: string;
  // perf
  fps: number;
  tier: number;                // 0 low … 3 ultra
  gpu: string;
  // log
  log: LogLine[];
  // data
  payloads: Partial<Record<ModuleId, ModulePayload>>;
  // human form (Phase 7)
  form: FormMode;
  embodiedPanels: ModuleId[];
}

interface NexusActions {
  set: (p: Partial<NexusState>) => void;
  push: (msg: string, level?: LogLevel) => void;
  rotate: (dir: -1 | 1) => void;
  goTo: (id: ModuleId) => void;
  setPayload: (p: ModulePayload) => void;
  setGesture: (name: string, confidence: number, hands: number) => void;
}

export const useNexus = create<NexusState & NexusActions>()(
  subscribeWithSelector((set, get) => ({
    booted: false,
    ringIndex: 0,
    hovered: null,
    selected: null,
    expanded: null,
    focused: null,
    dragging: null,
    multiSelect: [],
    frozen: false,
    driftEnabled: false,
    world: "studio",
    hudVisible: true,
    paletteOpen: false,
    soundOn: true,
    tracking: "off",
    gesture: { name: "—", confidence: 0, at: 0, hands: 0 },
    voice: "offline",
    awake: false,
    transcript: "",
    response: "",
    fps: 60,
    tier: 2,
    gpu: "—",
    log: [],
    payloads: {},
    form: "spatial",
    embodiedPanels: [],

    set: (p) => set(p),
    push: (msg, level = "info") =>
      set((s) => ({ log: [...s.log.slice(-40), { t: Date.now(), msg, level }] })),
    rotate: (dir) => {
      if (get().form === "human") return;
      set((s) => ({ ringIndex: s.ringIndex + dir }));
    },
    goTo: (id) => {
      const n = MODULE_IDS.length;
      const target = MODULE_IDS.indexOf(id);
      const cur = get().ringIndex;
      const curMod = ((cur % n) + n) % n;
      let d = target - curMod;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      set({ ringIndex: cur + d });
    },
    setPayload: (p) => set((s) => ({ payloads: { ...s.payloads, [p.id]: p } })),
    setGesture: (name, confidence, hands) => set({ gesture: { name, confidence, at: Date.now(), hands } }),
  })),
);

export const nexus = () => useNexus.getState();
export const log = (msg: string, level: LogLevel = "info") => useNexus.getState().push(msg, level);
