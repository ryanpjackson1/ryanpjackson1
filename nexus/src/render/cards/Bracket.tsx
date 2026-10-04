"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { presentation } from "@/core/clocks/presentation";
import { MODULE_IDS } from "@/core/modules";
import { RING, rt } from "@/core/runtime";

/**
 * Quad-based FUI targeting bracket. Four L-shaped corners (two thin quads
 * each) converge from outside the frame onto the target card, lock, and
 * dissolve. It rides the card's published world matrix, so it is always
 * exactly on the card wherever the card is in its flight.
 */
const T = 0.012;  // stroke thickness (m)
const L = 0.16;   // arm length (m)

export function Bracket() {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.2), transparent: true, depthTest: false, toneMapped: false }),
    [],
  );
  const corners = useMemo(() => [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const, []);
  const refs = useRef<(THREE.Group | null)[]>([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const env = presentation.envelopes();
    if (!env.id || env.bracketAlpha <= 0.001) { g.visible = false; return; }
    g.visible = true;
    const i = MODULE_IDS.indexOf(env.id);
    g.matrixAutoUpdate = false;
    g.matrix.copy(rt.cardMatrices[i]);
    g.matrixWorldNeedsUpdate = true;
    mat.opacity = env.bracketAlpha;
    // converge: from 4× outside the frame to a small gap around the card
    const spread = 1 + (1 - env.bracket) * 3.2;
    const gap = 0.07;
    corners.forEach(([sx, sy], k) => {
      const c = refs.current[k];
      if (!c) return;
      c.position.set(sx * (RING.cardW / 2 + gap) * spread, sy * (RING.cardH / 2 + gap) * spread, 0.02);
      c.rotation.z = (1 - env.bracket) * 0.6 * sx * sy;
    });
  });

  return (
    <group ref={group} renderOrder={10}>
      {corners.map(([sx, sy], k) => (
        <group key={k} ref={(el) => { refs.current[k] = el; }}>
          {/* horizontal arm */}
          <mesh material={mat} position={[(-sx * L) / 2, 0, 0]}>
            <planeGeometry args={[L, T]} />
          </mesh>
          {/* vertical arm */}
          <mesh material={mat} position={[0, (-sy * L) / 2, 0]}>
            <planeGeometry args={[T, L]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
