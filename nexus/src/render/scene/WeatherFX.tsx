"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { live } from "./worldState";
import { formClock } from "@/core/clocks/form";

/**
 * The whole world reflects the weather: rain streaks, snow, fog (via
 * worldState fog density) and warm sun (via the key light + shafts).
 */
const vert = /* glsl */ `
attribute float aSeed;
uniform float uT; uniform float uSpeed; uniform float uSize;
varying float vSeed;
void main(){
  vec3 p = position;
  p.y = mod(p.y - uT * uSpeed * (0.8 + aSeed * 0.4) + 3.0, 9.0) - 3.0;
  p.x += sin(uT * 0.7 + aSeed * 30.0) * (1.0 - step(5.0, uSpeed)) * 0.3; // snow sways, rain doesn't
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (6.0 / -mv.z);
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform float uAlpha; uniform float uStreak; uniform vec3 uColor;
varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = uStreak > 0.5
    ? (1.0 - smoothstep(0.0, 0.06, abs(c.x))) * (1.0 - smoothstep(0.3, 0.5, abs(c.y)))
    : smoothstep(0.5, 0.1, length(c));
  a *= uAlpha * (0.4 + vSeed * 0.6);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function Precip({ kind }: { kind: "rain" | "snow" }) {
  const N = kind === "rain" ? 2600 : 1600;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3);
    const s = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 1.2 + Math.random() * 12;
      const a = Math.random() * Math.PI * 2;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = -3 + Math.random() * 9;
      p[i * 3 + 2] = Math.sin(a) * r;
      s[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(s, 1));
    return g;
  }, [N]);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: 0 }, uSpeed: { value: kind === "rain" ? 9 : 0.7 }, uSize: { value: kind === "rain" ? 7 : 3 },
        uAlpha: { value: 0 }, uStreak: { value: kind === "rain" ? 1 : 0 }, uColor: { value: new THREE.Color(kind === "rain" ? "#a9c8ff" : "#eef4ff") },
      },
    }),
    [kind],
  );
  useFrame((_, dt) => {
    const w = live.weather;
    const amt = kind === "rain" ? Math.min(1, w.rain + w.storm) : w.snow;
    mat.uniforms.uT.value += dt;
    mat.uniforms.uAlpha.value = amt * 0.55 * (1 - formClock.envelopes().atmosphereGone);
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

export function WeatherFX() {
  return (
    <>
      <Precip kind="rain" />
      <Precip kind="snow" />
    </>
  );
}
