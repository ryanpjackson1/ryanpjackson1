"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useNexus, log } from "@/stores/nexus";
import { rt } from "@/core/runtime";

/**
 * Adaptive quality. Measures frame time over 2 s windows and steps the
 * tier down below ~50 fps or up above ~58 fps with headroom.
 * While the human-form sequence runs, its judgement is SUSPENDED and any
 * decision is parked in rt.pendingTier — rebuilding the particle buffer
 * mid-choreography once dropped every figure point and collapsed the face.
 */
export function PerfMonitor() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ t: 0, frames: 0, good: 0, bad: 0, fpsT: 0, fpsF: 0 });
  const gpuDone = useRef(false);

  useFrame((_, dt) => {
    const a = acc.current;
    rt.time += dt;
    if (!gpuDone.current) {
      gpuDone.current = true;
      try {
        const ctx = gl.getContext();
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        const name = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
        const clean = String(name).replace(/ANGLE \((.*)\)/, "$1").replace(/, or similar|Direct3D11.*|OpenGL.*/g, "").trim();
        useNexus.getState().set({ gpu: clean.slice(0, 48) });
      } catch { /* not exposed */ }
    }
    a.fpsT += dt; a.fpsF++;
    if (a.fpsT >= 0.5) {
      useNexus.getState().set({ fps: Math.round(a.fpsF / a.fpsT) });
      a.fpsT = 0; a.fpsF = 0;
    }
    if (document.hidden) return;
    a.t += dt; a.frames++;
    if (a.t < 2) return;
    const fps = a.frames / a.t;
    a.t = 0; a.frames = 0;
    if (rt.perfSuspended) return; // no judgement during the transformation
    const st = useNexus.getState();
    if (fps < 48) { a.bad++; a.good = 0; } else if (fps > 58) { a.good++; a.bad = 0; } else { a.good = 0; a.bad = 0; }
    let next = st.tier;
    if (a.bad >= 2 && st.tier > 0) next = st.tier - 1;
    if (a.good >= 5 && st.tier < 3) next = st.tier + 1;
    if (next !== st.tier) {
      a.good = 0; a.bad = 0;
      if (st.form === "human") { rt.pendingTier = next; return; }
      st.set({ tier: next });
      log(`PERF · ${fps.toFixed(0)} fps → quality tier T${next}`, next < st.tier ? "warn" : "info");
    }
  });
  return null;
}
