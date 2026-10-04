"use client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "./runtime";

/**
 * Camera pose = rest pose + drift. With DRIFT off the drift term is
 * exactly zero, so the camera is bit-for-bit still frame to frame.
 */
const REST = new THREE.Vector3(0, 0.28, 1.35);
const LOOK = new THREE.Vector3(0, 0, -3.6);
const pos = new THREE.Vector3();
const look = new THREE.Vector3();

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    pos.copy(REST);
    look.copy(LOOK);
    if (rt.motion > 0) {
      const t = rt.driftTime, m = rt.motion;
      pos.x += Math.sin(t * 0.13) * 0.06 * m;
      pos.y += Math.sin(t * 0.17 + 1.2) * 0.035 * m;
      look.x += Math.sin(t * 0.11 + 2) * 0.08 * m;
    }
    camera.position.copy(pos);
    camera.lookAt(look);
  });
  return null;
}
