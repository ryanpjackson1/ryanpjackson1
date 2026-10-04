"use client";
import type * as THREE from "three";
import { formClock, type FormPhase } from "@/core/clocks/form";
import { rt } from "@/core/runtime";
import { useNexus, log } from "@/stores/nexus";
import { scheduleCardLeave, resetCardLeave } from "./schedule";
import { presentation } from "@/core/clocks/presentation";
import { uiSound } from "@/audio/engine";

/**
 * The one controller for the human form. It starts and reverses the
 * master clock and enforces the protections; it never animates anything
 * itself — every layer reads the clock.
 */
interface Attachment {
  gl: THREE.WebGLRenderer;
  build: (tier: number) => Promise<void>;
  release: () => void;
}

type SpeakFn = (text: string, opts?: { record?: boolean }) => Promise<void>;

class FormController {
  private a: Attachment | null = null;
  /** Particle count is frozen for the whole transformation. */
  frozenTier = -1;
  private speak: SpeakFn | null = null;
  private greeted = false;
  private building = false;

  attach(a: Attachment) { this.a = a; }
  setSpeaker(fn: SpeakFn) { this.speak = fn; }

  constructor() {
    if (typeof window !== "undefined") formClock.on((p, prev) => this.onPhase(p, prev));
  }

  get ready() { return this.a !== null; }

  async toHuman(): Promise<boolean> {
    if (!this.a || this.building || formClock.engaged && formClock.phase !== "RETURNING") return false;
    this.building = true;
    try {
      // Protections: freeze the tier, suspend the monitor's judgement.
      const st = useNexus.getState();
      this.frozenTier = st.tier;
      rt.perfSuspended = true;
      if (presentation.id) presentation.close();
      st.set({ expanded: null, focused: null, dragging: null, hovered: null, selected: null, form: "human" });
      if (formClock.phase === "NORMAL") {
        scheduleCardLeave();
        await this.a.build(this.frozenTier);
      }
      uiSound("transform");
      formClock.toHuman();
      log("FORM · transformation sequence engaged");
      return true;
    } finally {
      this.building = false;
    }
  }

  toSpatial(): boolean {
    if (!formClock.engaged) return false;
    useNexus.getState().set({ embodiedPanels: [] });
    rt.panelTargets = [];
    uiSound("transform");
    log("FORM · returning to spatial mode");
    return formClock.toSpatial();
  }

  /** Per frame (called by HumanForm after the clock ticks). */
  frame() {}

  private onPhase(p: FormPhase, prev: FormPhase) {
    log(`FORM · ${prev} → ${p}`);
    if (p === "HUMANOID_ACTIVE" && !this.greeted) {
      this.greeted = true;
      void (async () => {
        await this.speak?.("I'm here.", { record: true });
        await new Promise((r) => setTimeout(r, 650));
        await this.speak?.("How can I help?", { record: true });
      })();
    }
    if (p === "RETURNING") this.greeted = false;
    if (p === "NORMAL") {
      this.a?.release();
      resetCardLeave();
      rt.perfSuspended = false;
      const st = useNexus.getState();
      st.set({ form: "spatial", embodiedPanels: [] });
      // a tier change that arrived mid-sequence is applied now the ring is back
      if (rt.pendingTier >= 0 && rt.pendingTier !== st.tier) {
        st.set({ tier: rt.pendingTier });
        log(`PERF · deferred tier change applied → T${rt.pendingTier}`);
      }
      rt.pendingTier = -1;
      this.frozenTier = -1;
      void import("@/audio/engine").then((m) => m.placeVoice(0, 0, -1));
    }
  }
}

export const formController = new FormController();
