"use client";
import { useFrame } from "@react-three/fiber";
import { MODULE_IDS } from "@/core/modules";
import { RING, rt } from "@/core/runtime";
import { SPRING, stepSpring, damp } from "@/core/motion";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { useNexus } from "@/stores/nexus";
import { HoloCard } from "./HoloCard";
import { Bracket } from "./Bracket";

/**
 * The orbit. Owns the ring spring and the stillness multiplier; each card
 * derives its own pose from them.
 */
export function CardRing() {
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const st = useNexus.getState();

    // Stillness (Phase 6): a 0..1 multiplier that settles over ~1 s, then
    // SNAPS to its target so a locked scene is exactly — not nearly — still.
    const target = st.driftEnabled && !st.frozen && !formClock.engaged ? 1 : 0;
    rt.motion = damp(rt.motion, target, 4.2, dt);
    if (Math.abs(rt.motion - target) < 1e-4) rt.motion = target;
    if (rt.motion > 0) rt.driftTime += dt * rt.motion;

    // Palm held still freezes the orbit where it is.
    if (!st.frozen) {
      stepSpring(rt.ring, st.ringIndex * RING.step, SPRING.orbit, dt);
      if (Math.abs(rt.ring.x - st.ringIndex * RING.step) < 1e-5 && Math.abs(rt.ring.v) < 1e-5) {
        rt.ring.x = st.ringIndex * RING.step;
        rt.ring.v = 0;
      }
    }
    stepSpring(rt.zoom, rt.zoomTarget, SPRING.reporting, dt);
    if (Math.abs(rt.zoom.x - rt.zoomTarget) < 1e-5 && Math.abs(rt.zoom.v) < 1e-5) {
      rt.zoom.x = rt.zoomTarget;
      rt.zoom.v = 0;
    }

    presentation.tick(dt);
  });

  return (
    <group>
      {MODULE_IDS.map((id, i) => (
        <HoloCard key={id} id={id} index={i} />
      ))}
      <Bracket />
    </group>
  );
}
