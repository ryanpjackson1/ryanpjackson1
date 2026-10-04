"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { formClock } from "@/core/clocks/form";
import { rt } from "@/core/runtime";
import { damp } from "@/core/motion";
import { useNexus } from "@/stores/nexus";
import { createBustMaterial } from "./beadMaterial";
import { buildJourney } from "./journey";
import { getFigure, getHand, type PointSet } from "./figureData";
import { CORE, FIGURE_SCALE } from "./schedule";
import { BUST } from "./sdf";
import { stepMouth, JAW_MAX, type MouthState } from "./mouth";
import { HandRig } from "./HandRig";
import { formController } from "./controller";
import { placeVoice } from "@/audio/engine";

const ORIGIN = new THREE.Vector3(CORE.x, CORE.y, CORE.z);
const tmp = new THREE.Vector3();

/** Same rigid head transform the vertex shader applies — used for the eyes. */
function headPoint(p: readonly number[], yaw: number, pitch: number, out: THREE.Vector3) {
  const [nx, ny, nz] = BUST.neckPivot;
  let x = p[0] - nx, y = p[1] - ny, z = p[2] - nz;
  // rotX(pitch)
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
  y = y1; z = z1;
  // rotY(yaw)
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x2 = x * cy + z * sy, z2 = -x * sy + z * cy;
  x = x2; z = z2;
  return out.set(ORIGIN.x + (x + nx) * FIGURE_SCALE, ORIGIN.y + (y + ny) * FIGURE_SCALE, ORIGIN.z + (z + nz) * FIGURE_SCALE);
}

const glowTex = (() => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 16; i++) {
    const r = i / 16;
    grd.addColorStop(r, `rgba(${Math.round(255 - 110 * r)},${Math.round(255 - 70 * r)},255,${Math.exp(-r * r * 9).toFixed(4)})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export function HumanForm() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const material = useMemo(() => createBustMaterial(true), []);
  const figRef = useRef<PointSet | null>(null);
  const eyes = useRef<(THREE.Sprite | null)[]>([]);
  const core = useRef<THREE.Sprite>(null);
  const skeleton = useRef<THREE.LineSegments>(null);
  const head = useRef({ yaw: 0, pitch: 0 });
  const mouth = useRef<MouthState>({ env: 0, open: 0 });
  const breath = useRef(0);

  // Pre-bake the figure for the current tier once the room is up, so the
  // command never waits on it. Async + chunked: nothing stalls.
  useEffect(() => {
    const tier = useNexus.getState().tier;
    const t = window.setTimeout(() => {
      void getFigure(gl, tier).then(() => getHand(gl, tier));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [gl]);

  // The controller asks us to build the journey at the instant of the command.
  useEffect(() => {
    formController.attach({
      gl,
      build: async (tier) => {
        const fig = await getFigure(gl, tier);
        figRef.current = fig;
        const g = buildJourney(fig);
        material.uniforms.uBead.value = fig.bead;
        setGeo((old) => { old?.dispose(); return g; });
      },
      release: () => setGeo((old) => { old?.dispose(); return null; }),
    });
  }, [gl, material]);

  const skelGeo = useMemo(() => {
    // faint armature: spine, clavicles, a ring for the skull
    const pts: number[] = [];
    const L = (a: number[], b: number[]) => pts.push(...a, ...b);
    L([0, -0.42, 0], [0, -0.04, -0.012]);
    L([0, -0.16, -0.01], [0.2, -0.22, -0.01]);
    L([0, -0.16, -0.01], [-0.2, -0.22, -0.01]);
    L([0.2, -0.22, -0.01], [0.21, -0.42, -0.01]);
    L([-0.2, -0.22, -0.01], [-0.21, -0.42, -0.01]);
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      L([Math.cos(a0) * 0.085, 0.13 + Math.sin(a0) * 0.1, 0], [Math.cos(a1) * 0.085, 0.13 + Math.sin(a1) * 0.1, 0]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const skelMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 0.75, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const eyeMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.4, 1.7, 2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }), []);
  const coreMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.2, 1.5, 2.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    formClock.tick(dt);
    formController.frame();
    const f = formClock.envelopes();
    const u = material.uniforms;
    const cam = state.camera as THREE.PerspectiveCamera;

    // 10 matrices + a few dozen uniforms — that's the whole CPU cost per frame
    const cards = u.uCards.value as THREE.Matrix4[];
    for (let i = 0; i < cards.length; i++) cards[i].copy(rt.cardMatrices[i]);
    u.uT.value = f.T;
    (u.uCore.value as THREE.Vector3).copy(ORIGIN);
    (u.uOrigin.value as THREE.Vector3).copy(ORIGIN);
    u.uScale.value = FIGURE_SCALE;
    (u.uProj.value as THREE.Matrix4).copy(cam.projectionMatrix);
    u.uViewportH.value = size.height * gl.getPixelRatio();
    u.uGlow.value = 0.6 + f.presence * 0.4;

    // ── alive, not animated: breath (caused), head turn (caused), mouth ──
    const presence = f.presence;
    if (presence > 0) breath.current += dt;
    u.uBreath.value = presence * (0.5 - 0.5 * Math.cos((breath.current * Math.PI * 2) / 4.8));
    // look target: the newest presented panel, else the cursor / hand
    let lx = rt.pointer.x, ly = rt.pointer.y;
    if (rt.hands[0].present) { lx = rt.hands[0].px; ly = rt.hands[0].py; }
    const panels = rt.panelTargets;
    if (panels.length) { lx = panels[panels.length - 1].x; ly = panels[panels.length - 1].y; }
    const tyaw = Math.max(-0.42, Math.min(0.42, lx * 0.5)) * presence;
    const tpitch = Math.max(-0.2, Math.min(0.2, -ly * 0.22)) * presence;
    const h = head.current;
    h.yaw = damp(h.yaw, tyaw, 3.2, dt);
    h.pitch = damp(h.pitch, tpitch, 3.2, dt);
    if (Math.abs(h.yaw - tyaw) < 1e-5) h.yaw = tyaw;
    if (Math.abs(h.pitch - tpitch) < 1e-5) h.pitch = tpitch;
    u.uYaw.value = h.yaw;
    u.uPitch.value = h.pitch;
    const m = stepMouth(mouth.current, presence > 0.5 ? rt.speech : 0, dt);
    u.uJaw.value = m.open * JAW_MAX;
    u.uMouth.value = m.open;
    rt.mouth = m.open;

    // eyes: two faint points of light that settle last
    BUST.eyes.forEach((e, i) => {
      const s = eyes.current[i];
      if (!s) return;
      headPoint([e[0], e[1], e[2] + 0.004], h.yaw, h.pitch, s.position);
      const sc = 0.028 * (0.6 + f.eyes * 0.4);
      s.scale.set(sc, sc, 1);
    });
    eyeMat.opacity = f.eyes;
    if (core.current) {
      core.current.position.copy(ORIGIN);
      const s = 0.12 + f.core * 0.42 + Math.sin(f.T * 6) * 0.02 * f.core;
      core.current.scale.set(s, s, 1);
    }
    coreMat.opacity = f.core * 0.55;
    skelMat.opacity = f.skeleton * 0.5;
    if (skeleton.current) skeleton.current.position.copy(ORIGIN);

    // the spatial voice moves to the face — direction only, distance capped
    if (f.presence > 0) {
      headPoint([0, BUST.mouthY, BUST.mouthZ], h.yaw, h.pitch, tmp);
      tmp.sub(cam.position);
      // listener is the camera; express in camera space
      tmp.applyQuaternion(cam.quaternion.clone().invert());
      placeVoice(tmp.x * f.presence, tmp.y * f.presence, tmp.z * f.presence - (1 - f.presence));
    }
  });

  const visible = geo !== null;
  return (
    <group>
      {visible && <points geometry={geo!} material={material} frustumCulled={false} renderOrder={3} />}
      <sprite ref={(s) => { eyes.current[0] = s; }} material={eyeMat} renderOrder={6} />
      <sprite ref={(s) => { eyes.current[1] = s; }} material={eyeMat} renderOrder={6} />
      <sprite ref={core} material={coreMat} renderOrder={5} />
      <lineSegments ref={skeleton} geometry={skelGeo} material={skelMat} />
      <HandRig />
    </group>
  );
}
