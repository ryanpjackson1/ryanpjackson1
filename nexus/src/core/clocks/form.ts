"use client";
import { ramp, clamp01, smoothstep } from "../motion";

/**
 * The human-form master clock (Phase 7).
 *
 * ONE clock, ONE controller. A single time value T drives explicit phases;
 * every layer (cards, atmosphere, camera, post chain, figure) reads
 * envelopes derived from T and writes nothing back. The return journey is
 * the very same clock run backward at 1.7× — not a second choreography.
 */
export type FormPhase =
  | "NORMAL"
  | "COMMAND_DETECTED"
  | "COLLAPSING"
  | "PARTICLE_CORE"
  | "SKELETON_FORMING"
  | "HUMANOID_FORMING"
  | "HUMANOID_ACTIVE"
  | "RETURNING";

/** Phase boundaries in seconds of T. */
export const FORM_T = {
  detected: 0,
  collapse: 0.7,      // dissolve starts
  core: 3.3,          // everything has gathered
  skeleton: 4.5,      // burst outward, armature appears
  humanoid: 5.6,      // beads landing crown-first
  active: 8.8,        // form complete, eyes lit
  end: 9.6,
} as const;

/** Card departure window: particles leave the card faces within this span. */
export const LEAVE = { start: 0.7, span: 2.0, travel: 0.85 } as const;
/** Figure arrival window (crown first, chest last). */
export const ARRIVE = { start: 4.5, span: 3.2, travel: 1.05 } as const;

export const RETURN_SPEED = 1.7;

export interface FormEnvelopes {
  phase: FormPhase;
  T: number;
  /** Room dims (atmosphere, HUD, ring lights). */
  dim: number;
  /** Overall journey 0..1 (camera dolly, DOF release). */
  journey: number;
  /** Card-face erosion clock (shared with the particles' leave times). */
  dissolve: number;
  /** Dust/shafts/floor drawn in after the cards. */
  atmosphereGone: number;
  /** Core brightness — a bell over the gather. */
  core: number;
  /** Faint armature lines. */
  skeleton: number;
  /** Bead shading takes over from fragment colours. */
  body: number;
  eyes: number;
  /** The figure is "here": idle breath, head tracking, mouth. */
  presence: number;
  /** Particles exist at all (buffer drawn). */
  particles: number;
}

type Listener = (phase: FormPhase, prev: FormPhase) => void;

class FormClock {
  T = 0;
  private dir: 0 | 1 | -1 = 0;
  private _phase: FormPhase = "NORMAL";
  private listeners = new Set<Listener>();

  get phase() { return this._phase; }
  /** True from the command until the ring is fully back. */
  get engaged() { return this._phase !== "NORMAL"; }
  get embodied() { return this._phase === "HUMANOID_ACTIVE"; }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  toHuman() {
    if (this.dir === 1 || this._phase === "HUMANOID_ACTIVE") return false;
    this.dir = 1;
    return true;
  }

  toSpatial() {
    if (this._phase === "NORMAL" || this.dir === -1) return false;
    this.dir = -1;
    this.setPhase("RETURNING");
    return true;
  }

  /** Debug/verification: jump to a time and hold. */
  scrub(T: number) {
    this.T = Math.max(0, Math.min(FORM_T.end, T));
    this.dir = 0;
    this.setPhase(this.T <= 0 ? "NORMAL" : this.phaseAt(this.T));
  }

  tick(dt: number) {
    if (this.dir === 0) return;
    if (this.dir === 1) {
      this.T = Math.min(FORM_T.end, this.T + dt);
      this.setPhase(this.phaseAt(this.T));
      if (this.T >= FORM_T.end) this.dir = 0;
    } else {
      this.T = Math.max(0, this.T - dt * RETURN_SPEED);
      if (this.T <= 0) {
        this.dir = 0;
        this.setPhase("NORMAL");
      }
    }
  }

  private phaseAt(T: number): FormPhase {
    if (T < FORM_T.collapse) return "COMMAND_DETECTED";
    if (T < FORM_T.core) return "COLLAPSING";
    if (T < FORM_T.skeleton) return "PARTICLE_CORE";
    if (T < FORM_T.humanoid) return "SKELETON_FORMING";
    if (T < FORM_T.active) return "HUMANOID_FORMING";
    return "HUMANOID_ACTIVE";
  }

  private setPhase(p: FormPhase) {
    if (p === this._phase) return;
    const prev = this._phase;
    this._phase = p;
    this.listeners.forEach((fn) => fn(p, prev));
  }

  envelopes(): FormEnvelopes {
    const T = this.T;
    return {
      phase: this._phase,
      T,
      dim: ramp(T, 0.05, 1.1),
      journey: smoothstep(0.3, FORM_T.active, T),
      dissolve: clamp01((T - LEAVE.start) / LEAVE.span),
      atmosphereGone: ramp(T, 1.6, 3.4),
      core: ramp(T, 1.8, 3.3) * (1 - ramp(T, 4.6, 6.2)),
      skeleton: ramp(T, 4.3, 5.0) * (1 - ramp(T, 6.6, 7.8)),
      body: ramp(T, ARRIVE.start + 0.6, FORM_T.active - 0.4),
      eyes: ramp(T, FORM_T.active - 0.5, FORM_T.end - 0.1),
      presence: ramp(T, FORM_T.active - 0.2, FORM_T.end),
      particles: T > 0.6 ? 1 : 0,
    };
  }
}

export const formClock = new FormClock();
