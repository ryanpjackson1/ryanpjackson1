"use client";
import { useFrame } from "@react-three/fiber";
import { MODULE_IDS } from "@/modules/registry";
import { useNexus } from "@/state/store";
import { approach, springFor, stepSpring } from "@/motion/spring";
import { RING, rt } from "./runtime";
import { Card } from "./Card";

/** Owns the orbit spring and the drift multiplier; cards derive from them. */
export function CardRing() {
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const st = useNexus.getState();
    // Drift is a 0..1 multiplier so toggling settles smoothly (~1 s) and
    // then SNAPS — a locked scene is exactly still, not nearly still.
    const target = st.drift && !st.reducedMotion ? 1 : 0;
    rt.motion = st.reducedMotion ? target : approach(rt.motion, target, 4, dt);
    if (rt.motion > 0) rt.driftTime += dt * rt.motion;
    stepSpring(rt.ring, st.ringIndex * RING.step, springFor("orbit", st.reducedMotion), dt, 1e-5);
  });
  return (
    <group>
      {MODULE_IDS.map((id, i) => <Card key={id} id={id} index={i} />)}
    </group>
  );
}
