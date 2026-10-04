"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, DepthOfField, Noise } from "@react-three/postprocessing";
import type { BloomEffect, DepthOfFieldEffect } from "postprocessing";
import { GradeEffect } from "./GradeEffect";
import { live } from "@/render/scene/worldState";
import { formClock } from "@/core/clocks/form";
import { presentation } from "@/core/clocks/presentation";
import { rt, RING } from "@/core/runtime";
import { wakeEnvelope } from "@/render/scene/Atmosphere";
import { useNexus } from "@/stores/nexus";
import { lerp } from "@/core/motion";

/** Bloom → DOF → grade. The chain adapts to the tier and the human form. */
export function PostFX() {
  const tier = useNexus((s) => s.tier);
  const grade = useMemo(() => new GradeEffect(), []);
  const bloom = useRef<BloomEffect>(null);
  const dof = useRef<DepthOfFieldEffect>(null);
  const fade = useRef(0);

  useFrame((_, dt) => {
    const g = live.grade;
    const f = formClock.envelopes();
    grade.u("uShadow").value.set(...g.shadow);
    grade.u("uHighlight").value.set(...g.highlight);
    grade.u("uSplit").value = g.split;
    grade.u("uContrast").value = g.contrast;
    grade.u("uWarmth").value = g.warmth;
    grade.u("uHalation").value = g.halation;
    grade.u("uBleed").value = g.bleed;
    grade.u("uSat").value = g.saturation;
    grade.u("uCross").value = rt.crossover;
    grade.u("uWake").value = wakeEnvelope();
    // Release most of the vignette while embodied — it cropped the bust into a black oval.
    grade.u("uVignette").value = lerp(0.72, 0.12, f.journey);
    fade.current = Math.min(1, fade.current + dt / 1.2);
    grade.u("uFade").value = fade.current;

    if (bloom.current) {
      bloom.current.intensity = 0.9 + g.bleed * 0.25 + f.core * 1.6 + wakeEnvelope() * 0.6;
    }
    if (dof.current) {
      // Focus the ring (or the presented card); release DOF entirely while
      // embodied — the ring's focus distance smeared a face nearer than it.
      const env = presentation.envelopes();
      const focus = env.id ? lerp(RING.radius, 2.15, env.fly) : RING.radius + 0.9;
      dof.current.cocMaterial.focusDistance = focus;
      dof.current.bokehScale = lerp(tier >= 2 ? 2.2 : 1.2, 0, Math.min(1, f.journey * 1.6));
    }
  });

  return (
    <EffectComposer multisampling={tier >= 3 ? 4 : 0} enableNormalPass={false}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.5} luminanceSmoothing={0.25} intensity={1} radius={0.72} />
      {tier >= 1 ? <DepthOfField ref={dof} focusDistance={RING.radius} focusRange={2.4} bokehScale={2} /> : <></>}
      <primitive object={grade} />
      <Noise opacity={0.028} premultiply />
    </EffectComposer>
  );
}
