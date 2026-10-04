"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { MODULES, type ModuleId } from "@/modules/registry";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { springFor, stepSpring, type Spring } from "@/motion/spring";
import { RING, rt, slotAngle } from "./runtime";
import { createCardMaterial, PLANE_W, PLANE_H } from "./cardMaterial";
import { drawCardFace, FACE_W, FACE_H } from "./cardFace";

const DRAG_THRESHOLD_PX = 6;
const dir = new THREE.Vector3();
const proj = new THREE.Vector3();

/** One glass card. Its pose is derived from the orbit spring and its own springs. */
export function Card({ id, index }: { id: ModuleId; index: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = FACE_W;
    c.height = FACE_H;
    drawCardFace(c, id);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [id]);
  const material = useMemo(
    () => createCardMaterial(texture, new THREE.Color().setHSL(MODULES[id].hue / 360, 0.75, 0.68)),
    [texture, id],
  );
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);

  const sp = useRef({
    hover: { x: 0, v: 0 } as Spring,
    sel: { x: 0, v: 0 } as Spring,
    held: { x: 0, v: 0 } as Spring,
    ox: { x: 0, v: 0 } as Spring,
    oy: { x: 0, v: 0 } as Spring,
    oz: { x: 0, v: 0 } as Spring,
  });

  useFrame((state, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 1 / 20);
    const st = useNexus.getState();
    const s = sp.current;
    const rm = st.reducedMotion;

    const a = slotAngle(index, rt.ring.x + rt.ringDrag);
    let x = Math.sin(a) * RING.radius;
    let z = -Math.cos(a) * RING.radius;
    let y = 0;
    let rx = 0, rz = 0;
    if (rt.motion > 0) {
      const t = rt.driftTime;
      y += rt.motion * Math.sin(t * 0.55 + index * 1.7) * 0.05;
      rz += rt.motion * Math.sin(t * 0.4 + index * 2.3) * 0.012;
      rx += rt.motion * Math.sin(t * 0.45 + index) * 0.015;
    }

    const held = st.grabbedId === id;
    stepSpring(s.hover, st.hoveredId === id ? 1 : 0, springFor("acknowledge", rm), dt);
    stepSpring(s.sel, st.selectedId === id ? 1 : 0, springFor("arrive", rm), dt);
    stepSpring(s.held, held ? 1 : 0, springFor("acknowledge", rm), dt);

    // hover lifts the card toward the viewer
    const lift = s.hover.x * 0.18 + s.held.x * 0.25;
    x -= Math.sin(a) * lift;
    z += Math.cos(a) * lift;

    // a held card follows the pointer with lag; released, it springs back to its slot
    let tx = 0, ty = 0, tz = 0;
    if (held) {
      const cam = state.camera;
      dir.set(rt.hand.active ? rt.hand.x : rt.pointer.x, rt.hand.active ? rt.hand.y : rt.pointer.y, 0.5).unproject(cam).sub(cam.position).normalize();
      const depth = (RING.radius - 0.9) / Math.max(0.25, -dir.z);
      tx = cam.position.x + dir.x * depth - x;
      ty = cam.position.y + dir.y * depth - y;
      tz = cam.position.z + dir.z * depth - z;
    }
    const cfg = springFor(held ? "follow" : "settle", rm);
    stepSpring(s.ox, tx, cfg, dt);
    stepSpring(s.oy, ty, cfg, dt);
    stepSpring(s.oz, tz, cfg, dt);

    m.position.set(x + s.ox.x, y + s.oy.x, z + s.oz.x);
    m.rotation.set(rx, -a + s.ox.v * 0.03, rz - s.ox.v * 0.02, "YXZ");
    m.scale.setScalar(1 + s.hover.x * 0.04 + s.held.x * 0.05);

    const u = material.uniforms;
    u.uHover.value = s.hover.x;
    u.uSelected.value = Math.max(0, s.sel.x);
    u.uHeld.value = s.held.x;
    u.uTime.value = rt.driftTime;
    // cards behind the viewer dim; the panel's modal state dims everything a little
    const behind = Math.cos(a) < -0.1;
    u.uOpacity.value = (behind ? 0.45 : 1) * (st.openId && st.openId !== id ? 0.55 : 1);

    // publish the screen position for webcam pinch hit-testing
    proj.copy(m.position).project(state.camera);
    const cs = rt.cardScreen[index];
    cs.x = proj.x; cs.y = proj.y; cs.visible = proj.z < 1 && Math.cos(a) > 0.2;
  });

  // ── pointer: click opens, drag holds the card, release returns it ─────
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let grabbed = false;
    const move = (ev: PointerEvent) => {
      if (!grabbed && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD_PX) {
        grabbed = true;
        dispatch({ type: "card/grab", id }, "mouse");
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (grabbed) dispatch({ type: "card/release" }, "mouse");
      else dispatch({ type: "module/open", id }, "mouse");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <mesh
      ref={mesh}
      material={material}
      renderOrder={2}
      onPointerDown={onPointerDown}
      onPointerOver={(e) => { e.stopPropagation(); dispatch({ type: "card/hover", id }, "mouse"); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { if (useNexus.getState().hoveredId === id) dispatch({ type: "card/hover", id: null }, "mouse"); document.body.style.cursor = ""; }}
    >
      <planeGeometry args={[PLANE_W, PLANE_H]} />
    </mesh>
  );
}
