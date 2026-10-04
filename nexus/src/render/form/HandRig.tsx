"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { formClock } from "@/core/clocks/form";
import { rt } from "@/core/runtime";
import { CURVE, clamp01, lerp } from "@/core/motion";
import { useNexus } from "@/stores/nexus";
import type { ModuleId } from "@/core/modules";
import { createHandMaterial } from "./beadMaterial";
import { getHand } from "./figureData";
import { formController } from "./controller";

/**
 * THE HAND. Ask the figure about anything and its hand rises from below
 * the frame with the panel floating above its open palm, holds it for a
 * beat, opens its fingers, and lowers away.
 *
 * Rigged on the CPU as one rigid thing from SCREEN-SPACE targets — a wrist
 * position and a palm basis interpolated between a retracted pose below
 * the frame and the presenting pose — so the gesture lands in the same
 * place whatever the camera is doing. The rig publishes where the held
 * panel's centre should sit (screen px) every frame; the DOM panel follows
 * that anchor and springs to its slot the moment the hand lets go.
 */
export type PresentStage = "idle" | "rise" | "hold" | "open" | "lower";

export const STAGE_TIME: Record<Exclude<PresentStage, "idle">, number> = {
  rise: 1.15,
  hold: 0.75,
  open: 0.5,
  lower: 0.95,
};

export const presenter = {
  stage: "idle" as PresentStage,
  t: 0,
  id: null as ModuleId | null,
  queue: [] as ModuleId[],
  /** True once the hand has let go of `id` this cycle. */
  released: false,
  /** The hand is available (baked + embodied). */
  ready: false,
};

/** Screen-space poses (NDC) and distance from the lens. */
const POSE = {
  retracted: { x: 0.7, y: -1.9 },
  presenting: { x: 0.6, y: -0.46 },
  distance: 1.2,
};

const R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3();
const wrist = new THREE.Vector3(), nrm = new THREE.Vector3(), fing = new THREE.Vector3(), thumbX = new THREE.Vector3();
const anchor = new THREE.Vector3();
const basis = new THREE.Matrix4();

export function HandRig() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const material = useMemo(() => createHandMaterial(), []);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const pts = useRef<THREE.Points>(null);

  // the hand is baked through the same pipeline as the bust
  useEffect(() => {
    let alive = true;
    const unsub = formClock.on((p) => {
      if (p === "HUMANOID_FORMING" && !geo) {
        const tier = formController.frozenTier >= 0 ? formController.frozenTier : useNexus.getState().tier;
        void getHand(gl, tier).then((h) => {
          if (!alive) return;
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(h.pos, 3));
          g.setAttribute("normal", new THREE.BufferAttribute(h.nrm, 3));
          g.setAttribute("aRegion", new THREE.BufferAttribute(h.region, 3));
          g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
          material.uniforms.uBead.value = h.bead;
          setGeo(g);
        });
      }
    });
    return () => { alive = false; unsub(); };
  }, [gl, geo, material]);

  // new presented panels queue a presentation
  useEffect(
    () => useNexus.subscribe((s) => s.embodiedPanels, (now, before) => {
      const added = now.filter((id) => !before.includes(id));
      added.forEach((id) => presenter.queue.push(id));
    }),
    [],
  );

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const cam = state.camera as THREE.PerspectiveCamera;
    presenter.ready = !!geo && formClock.embodied;

    // advance the presentation state machine
    if (presenter.stage === "idle" && presenter.queue.length) {
      presenter.id = presenter.queue.shift()!;
      presenter.released = false;
      if (presenter.ready) { presenter.stage = "rise"; presenter.t = 0; }
      else presenter.released = true; // no hand: the panel slides in from the edge
    }
    if (presenter.stage !== "idle") {
      presenter.t += dt;
      const dur = STAGE_TIME[presenter.stage];
      if (presenter.t >= dur) {
        presenter.t -= dur;
        presenter.stage = presenter.stage === "rise" ? "hold" : presenter.stage === "hold" ? "open" : presenter.stage === "open" ? "lower" : "idle";
        if (presenter.stage === "lower") presenter.released = true;
      }
    }
    if (!formClock.embodied && presenter.stage !== "idle") {
      presenter.stage = "idle";
      presenter.released = true;
    }

    // ── pose from the stage ─────────────────────────────────────────
    const st = presenter.stage;
    const k = st === "idle" ? 0 : presenter.t / STAGE_TIME[st];
    let lift = 0, curl = 0.42, mat = 0;
    if (st === "rise") { lift = CURVE.arriving(k); mat = clamp01(k / 0.33); curl = 0.5 - 0.08 * k; }
    else if (st === "hold") { lift = 1; mat = 1; curl = 0.42; }
    else if (st === "open") { lift = 1; mat = 1; curl = lerp(0.42, 0.02, CURVE.reporting(k)); }
    else if (st === "lower") { lift = 1 - CURVE.leaving(k); mat = 1 - clamp01((k - 0.67) / 0.33); curl = lerp(0.02, 0.25, k); }

    const p = pts.current;
    if (!p) { rt.handAnchor = null; return; }
    p.visible = st !== "idle" && mat > 0;

    // camera basis
    cam.matrixWorld.extractBasis(R, U, F);
    F.negate();
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const D = POSE.distance;
    const nx = lerp(POSE.retracted.x, POSE.presenting.x, lift);
    const ny = lerp(POSE.retracted.y, POSE.presenting.y, lift);
    wrist.copy(cam.position).addScaledVector(F, D).addScaledVector(R, nx * D * tanY * cam.aspect).addScaledVector(U, ny * D * tanY);
    // palm up and a little toward the lens; fingers away and inward
    nrm.copy(U).multiplyScalar(0.86).addScaledVector(F, -0.42).normalize();
    fing.copy(F).multiplyScalar(0.62).addScaledVector(R, -0.5).addScaledVector(U, 0.25);
    fing.addScaledVector(nrm, -fing.dot(nrm)).normalize();
    thumbX.crossVectors(fing, nrm).normalize();
    basis.makeBasis(thumbX, fing, nrm).setPosition(wrist);

    const u = material.uniforms;
    (u.uHand.value as THREE.Matrix4).copy(basis);
    u.uCurl.value = curl;
    u.uThumb.value = curl * 0.7;
    u.uMaterialise.value = mat * 1.0001;
    (u.uProj.value as THREE.Matrix4).copy(cam.projectionMatrix);
    u.uViewportH.value = size.height * gl.getPixelRatio();

    // publish the held panel's anchor: above the open palm, in screen space
    if (st !== "idle" && !presenter.released) {
      anchor.set(0.005, 0.07, 0.15).applyMatrix4(basis).project(cam);
      rt.handAnchor = {
        x: (anchor.x * 0.5 + 0.5) * size.width,
        y: (0.5 - anchor.y * 0.5) * size.height,
        visible: mat,
      };
    } else rt.handAnchor = null;
  });

  return geo ? <points ref={pts} geometry={geo} material={material} frustumCulled={false} renderOrder={4} /> : null;
}
