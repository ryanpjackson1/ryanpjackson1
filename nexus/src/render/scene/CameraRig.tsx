"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { rt } from "@/core/runtime";
import { presentation } from "@/core/clocks/presentation";
import { formClock } from "@/core/clocks/form";
import { CORE } from "@/render/form/schedule";
import { lerp } from "@/core/motion";

/**
 * The floating camera. Its pose is a pure function of: the rest pose,
 * the motion-gated drift, the presentation push (along the VIEW AXIS), and
 * the human-form journey. With zero input and DRIFT off, every term is
 * constant, so position and rotation are bit-for-bit identical frame to frame.
 */
export const CAMERA_REST = { pos: new THREE.Vector3(0, 0.32, 1.25), look: new THREE.Vector3(0, 0.02, -3.7) };
/** Framing for the embodied figure. */
export const CAMERA_FIGURE = {
  pos: new THREE.Vector3(CORE.x, CORE.y + 0.02, CORE.z + 1.42),
  look: new THREE.Vector3(CORE.x, CORE.y - 0.04, CORE.z),
};

const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const axis = new THREE.Vector3();

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const parallax = useRef({ x: 0, y: 0 });
  useEffect(() => { rt.camera = camera; }, [camera]);

  useFrame(() => {
    const f = formClock.envelopes();
    const env = presentation.envelopes();
    const j = f.journey * f.journey * (3 - 2 * f.journey);

    pos.copy(CAMERA_REST.pos).lerp(CAMERA_FIGURE.pos, j);
    look.copy(CAMERA_REST.look).lerp(CAMERA_FIGURE.look, j);

    // drift: only when the motion multiplier is non-zero
    if (rt.motion > 0) {
      const t = rt.driftTime;
      const m = rt.motion * (1 - j);
      pos.x += Math.sin(t * 0.13) * 0.06 * m;
      pos.y += Math.sin(t * 0.17 + 1.2) * 0.035 * m;
      pos.z += Math.sin(t * 0.09 + 0.4) * 0.05 * m;
      look.x += Math.sin(t * 0.11 + 2.0) * 0.08 * m;
      // pointer parallax is part of DRIFT too — LOCKED means locked
      parallax.current.x = lerp(parallax.current.x, rt.pointer.x, 0.03);
      parallax.current.y = lerp(parallax.current.y, rt.pointer.y, 0.03);
      pos.x += parallax.current.x * 0.08 * m;
      pos.y += parallax.current.y * 0.05 * m;
    }

    // presentation push: along the view axis, toward the reading position
    if (env.push > 0) {
      axis.copy(look).sub(pos).normalize();
      pos.addScaledVector(axis, env.push * 0.55);
    }

    camera.position.copy(pos);
    camera.lookAt(look);
    // FOV tightens slightly for the figure
    const fov = lerp(42, 36, j);
    if (Math.abs(camera.fov - fov) > 1e-6) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
