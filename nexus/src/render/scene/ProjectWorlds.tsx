"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { live } from "./worldState";
import { useNexus } from "@/stores/nexus";
import { rt } from "@/core/runtime";

/**
 * Opening Projects transforms the environment: every project becomes a
 * small floating world — a wireframe planet with its name — hung in a
 * constellation above the ring.
 */
const MAX = 12;

function labelTexture(text: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const g = c.getContext("2d")!;
  g.font = '500 40px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = "rgba(214,230,255,0.92)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.length > 22 ? text.slice(0, 21) + "…" : text, 256, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ProjectWorlds() {
  const names = useNexus((s) => {
    const d = s.payloads.projects?.detail as { projects?: { name: string }[] } | undefined;
    return (d?.projects ?? []).slice(0, MAX).map((p) => p.name).join("|");
  });
  const list = useMemo(() => (names ? names.split("|") : []), [names]);
  const group = useRef<THREE.Group>(null);
  const planetMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.4), wireframe: true, transparent: true, opacity: 0, depthWrite: false }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.6, 1.2), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), []);
  const labels = useMemo(
    () => list.map((n) => new THREE.SpriteMaterial({ map: labelTexture(n), transparent: true, opacity: 0, depthWrite: false })),
    [list],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const k = live.projects;
    g.visible = k > 0.01;
    if (!g.visible) return;
    planetMat.opacity = 0.55 * k;
    ringMat.opacity = 0.25 * k;
    labels.forEach((m) => (m.opacity = k));
    g.children.forEach((c, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + rt.driftTime * 0.02;
      const r = 5.6 + (i % 3) * 0.9;
      c.position.set(Math.sin(a) * r, 1.9 + (i % 2) * 0.7 + (1 - k) * 2, -Math.cos(a) * r);
      c.rotation.y = rt.time * 0.15 + i; // a report of the data, not ambient camera motion
    });
  });

  return (
    <group ref={group}>
      {list.map((n, i) => (
        <group key={n + i}>
          <mesh material={planetMat}>
            <icosahedronGeometry args={[0.32 + (i % 3) * 0.06, 1]} />
          </mesh>
          <mesh material={ringMat} rotation-x={Math.PI / 2.4}>
            <ringGeometry args={[0.5, 0.52, 48]} />
          </mesh>
          <sprite material={labels[i]} position={[0, -0.62, 0]} scale={[1.4, 0.26, 1]} />
        </group>
      ))}
    </group>
  );
}
