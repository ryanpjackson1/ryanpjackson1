"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { MODULES, MODULE_IDS, hueToRgb, type ModuleId } from "@/core/modules";
import { RING, rt, slotAngle } from "@/core/runtime";
import { SPRING, stepSpring, damp, clamp01, type Spring1 } from "@/core/motion";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { useNexus } from "@/stores/nexus";
import { createCardMaterial, PLANE_W, PLANE_H } from "./cardMaterial";
import { createFaceCanvas, drawCardFace } from "./face";
import { cardLeave, CORE } from "@/render/form/schedule";
import { uiSound } from "@/audio/engine";

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const readingPos = new THREE.Vector3();
const lookM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

interface Props { id: ModuleId; index: number }

/** One holographic glass card. Pose is computed from the orbit spring + envelopes. */
export function HoloCard({ id, index }: Props) {
  const mesh = useRef<THREE.Mesh>(null);
  const meta = MODULES[id];
  const canvas = useMemo(() => {
    const c = createFaceCanvas();
    rt.cardCanvases[index] = c;
    return c;
  }, [index]);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const material = useMemo(() => createCardMaterial(texture, hueToRgb(meta.hue, 0.8, 0.62)), [texture, meta.hue]);

  // Spring state — hover lift, drag offset (x,y,z), selection.
  const s = useRef({
    hover: { x: 0, v: 0 } as Spring1,
    sel: { x: 0, v: 0 } as Spring1,
    dx: { x: 0, v: 0 } as Spring1,
    dy: { x: 0, v: 0 } as Spring1,
    dz: { x: 0, v: 0 } as Spring1,
    tilt: 0,
    lastDragX: 0,
    gold: 0,
  });

  // Redraw the face when data arrives and every few seconds for the age.
  useEffect(() => {
    const draw = () => {
      drawCardFace(canvas, id, useNexus.getState().payloads[id]);
      texture.needsUpdate = true;
    };
    draw();
    const unsub = useNexus.subscribe((st) => st.payloads[id], draw);
    const iv = window.setInterval(draw, 5000);
    // Web fonts land after first paint — redraw once they do.
    document.fonts?.ready.then(draw).catch(() => {});
    return () => { unsub(); window.clearInterval(iv); };
  }, [canvas, id, texture]);

  // Selection pulse.
  useEffect(
    () => useNexus.subscribe((st) => st.selected === id, (on) => {
      if (on) material.uniforms.uSelectT.value = rt.time;
    }),
    [id, material],
  );

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 1 / 20);
    const st = useNexus.getState();
    const S = s.current;
    const u = material.uniforms;
    const env = presentation.envelopes();
    const fenv = formClock.envelopes();
    const isTarget = env.id === id;

    const a = slotAngle(index, rt.ring.x + rt.ringDrag);
    const front = Math.atan2(Math.sin(a), Math.cos(a)); // −π..π, 0 = in front
    const R = RING.radius * rt.zoom.x;

    // ── base orbit pose ───────────────────────────────────────────────
    let x = Math.sin(a) * R;
    let z = -Math.cos(a) * R;
    let y = RING.y;
    let rotY = -a;
    let rotX = 0;
    let rotZ = 0;
    // idle float, gated by the motion multiplier (exactly 0 when LOCKED)
    if (rt.motion > 0) {
      const t = rt.driftTime;
      y += rt.motion * Math.sin(t * 0.55 + index * 1.71) * 0.045;
      rotZ += rt.motion * Math.sin(t * 0.37 + index * 2.3) * 0.012;
      rotX += rt.motion * Math.sin(t * 0.41 + index * 0.9) * 0.015;
    }

    // ── hover / select springs ───────────────────────────────────────
    const hovered = st.hovered === id || st.multiSelect.includes(id);
    stepSpring(S.hover, hovered ? 1 : 0, SPRING.acknowledging, dt);
    stepSpring(S.sel, st.selected === id ? 1 : 0, SPRING.arriving, dt);
    const lift = S.hover.x * 0.22 + S.sel.x * 0.12;
    x -= Math.sin(a) * lift;
    z += Math.cos(a) * lift;
    let scale = 1 + S.hover.x * 0.045 + S.sel.x * 0.02;

    // ── dragging: lag behind the hand on a following spring ──────────
    const dragging = st.dragging === id;
    let tx = 0, ty = 0, tz = 0;
    if (dragging && rt.camera) {
      const h = rt.hands[0].present ? rt.hands[0] : null;
      const ndcX = h ? h.px : rt.pointer.x;
      const ndcY = h ? h.py : rt.pointer.y;
      tmpV.set(ndcX, ndcY, 0.5).unproject(rt.camera).sub(rt.camera.position).normalize();
      const dist = (R - 0.6) / Math.max(0.2, -tmpV.z);
      const wx = rt.camera.position.x + tmpV.x * dist;
      const wy = rt.camera.position.y + tmpV.y * dist;
      const wz = rt.camera.position.z + tmpV.z * dist;
      tx = wx - x; ty = wy - y; tz = wz - z;
    }
    const follow = dragging ? SPRING.following : SPRING.orbit; // released cards return on the orbit spring
    stepSpring(S.dx, tx, follow, dt);
    stepSpring(S.dy, ty, follow, dt);
    stepSpring(S.dz, tz, follow, dt);
    x += S.dx.x; y += S.dy.x; z += S.dz.x;
    // momentum tilt from drag velocity
    S.tilt = damp(S.tilt, clamp01(Math.abs(S.dx.v) * 0.3) * Math.sign(S.dx.v), 10, dt);
    rotZ -= S.tilt * 0.25;
    rotY += S.dx.v * 0.04;
    if (dragging) scale *= 1.05;

    // ── presentation: others step back, the target flies to reading position
    let opacity = 1;
    if (env.id && !isTarget) {
      const back = env.stepBack;
      x += Math.sin(a) * back * 0.9;
      z -= Math.cos(a) * back * 0.9;
      opacity *= 1 - back * 0.6;
    }
    m.position.set(x, y, z);
    m.rotation.set(rotX, rotY, rotZ, "YXZ");
    if (isTarget && rt.camera && env.fly > 0) {
      // reading position: 2.15 m down the view axis, card facing the camera
      rt.camera.getWorldDirection(fwd);
      readingPos.copy(rt.camera.position).addScaledVector(fwd, 2.15);
      readingPos.y += 0.02;
      m.position.lerp(readingPos, env.fly);
      // Matrix4.lookAt(eye, target) aims +z from target toward eye: the face looks at the camera.
      lookM.lookAt(rt.camera.position, readingPos, UP);
      tmpQ.setFromRotationMatrix(lookM);
      m.quaternion.slerp(tmpQ, env.fly);
      scale *= 1 + env.fly * 0.08;
    }

    // ── human form: cards turn toward the core as they dissolve ───────
    const leave = cardLeave[index];
    if (fenv.T > 0) {
      const turn = clamp01((fenv.T - leave.start + 0.6) / 1.2);
      if (turn > 0) {
        tmpV.set(CORE.x, CORE.y, CORE.z);
        lookM.lookAt(tmpV, m.position, UP);
        tmpQ.setFromRotationMatrix(lookM);
        m.quaternion.slerp(tmpQ, turn * 0.85);
      }
    }
    m.scale.setScalar(scale);

    // publish the world matrix every frame — particles sit on the face pixel-for-pixel
    m.updateMatrixWorld();
    rt.cardMatrices[index].copy(m.matrixWorld);

    // ── gold: earned continuously by centring (power curve), never when warned
    const warn = st.payloads[id]?.warning ? 1 : 0;
    const centred = clamp01(1 - Math.abs(front) / (RING.step * 0.5));
    const goldTarget = warn ? 0 : Math.pow(centred, 3.2) * (env.id && !isTarget ? 0.3 : 1);
    S.gold = damp(S.gold, goldTarget, 8, dt);

    u.uTime.value = rt.time;
    u.uHover.value = S.hover.x;
    u.uSelected.value = clamp01(S.sel.x);
    u.uGold.value = warn ? 0 : S.gold;
    u.uWarn.value = warn;
    u.uOpacity.value = opacity * (Math.cos(a) < -0.2 ? 0.55 : 1);
    u.uDim.value = fenv.dim * 0.15;
    u.uScan.value = isTarget ? env.scan : -1;
    u.uFormT.value = fenv.T;
    u.uLeaveStart.value = leave.start;
    u.uLeaveSpan.value = leave.span;
    u.uSpeech.value = rt.speech;
    const r = rt.ripples[index];
    (u.uRipple.value as THREE.Vector3).set(r[0], r[1], r[2]);
    m.visible = fenv.T < leave.start + leave.span + 0.05;
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useNexus.getState().hovered !== id) {
      useNexus.getState().set({ hovered: id });
      uiSound("hover");
    }
  };
  const onOut = () => {
    if (useNexus.getState().hovered === id) useNexus.getState().set({ hovered: null });
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const uv = e.uv;
    if (uv) rt.ripples[index] = [rt.time, uv.x, uv.y];
  };

  return (
    <mesh
      ref={mesh}
      material={material}
      userData={{ moduleId: id, index }}
      onPointerOver={onOver}
      onPointerOut={onOut}
      onPointerDown={onDown}
      renderOrder={2}
    >
      <planeGeometry args={[PLANE_W, PLANE_H, 16, 16]} />
    </mesh>
  );
}

export const CARD_COUNT = MODULE_IDS.length;
