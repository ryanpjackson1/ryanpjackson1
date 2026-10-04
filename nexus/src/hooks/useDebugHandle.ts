"use client";
import { useEffect } from "react";
import { rt } from "@/core/runtime";
import { formClock } from "@/core/clocks/form";
import { presentation } from "@/core/clocks/presentation";
import { useNexus } from "@/stores/nexus";
import { dispatch, handleUtterance } from "@/core/dispatch";
import { formController } from "@/render/form/controller";
import { simulateLocalSpeech } from "@/voice/speech";
import { presenter } from "@/render/form/HandRig";

/**
 * window.__nexus — a read-mostly handle used by the verification scripts
 * (screenshots at each phase, zero-drift sampling, mouth/hand checks).
 */
export function useDebugHandle() {
  useEffect(() => {
    const w = window as unknown as { __nexus?: unknown };
    w.__nexus = {
      rt, formClock, presentation, formController, presenter,
      store: useNexus,
      dispatch, say: handleUtterance, simulateLocalSpeech,
      sample: () => ({
        ring: rt.ring.x, ringV: rt.ring.v, motion: rt.motion, speech: rt.speech,
        cam: rt.camera ? [...rt.camera.position.toArray(), ...rt.camera.quaternion.toArray()] : null,
        phase: formClock.phase, T: formClock.T, handAnchor: rt.handAnchor, mouth: rt.mouth,
      }),
    };
  }, []);
}
