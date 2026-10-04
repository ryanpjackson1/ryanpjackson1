"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useNexus } from "@/state/store";
import { dispatch } from "@/commands/dispatch";
import { RING, rt } from "./runtime";

/* Backdrop: a dark volumetric gradient — no stars, no galaxies. It also
   catches pointer events that miss the cards, to drag the ring. */
const backdropVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const backdropFrag = /* glsl */ `
uniform float uT;
varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 d = normalize(vDir);
  float fog = n3(d * 2.2 + vec3(uT * 0.01, 0.0, uT * 0.006)) * 0.6 + n3(d * 5.1) * 0.4;
  float horizon = exp(-abs(d.y + 0.05) * 4.5);
  vec3 col = vec3(0.010, 0.014, 0.026) * (0.8 + 0.5 * fog);
  col += vec3(0.07, 0.11, 0.22) * horizon * (0.35 + 0.4 * fog);
  col += vec3(0.5, 0.65, 1.0) * pow(clamp(d.y * 0.5 + 0.5, 0.0, 1.0), 8.0) * 0.03;
  gl_FragColor = vec4(col, 1.0);
}`;

function Backdrop() {
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: backdropVert, fragmentShader: backdropFrag, side: THREE.BackSide, depthWrite: false, uniforms: { uT: { value: 0 } } }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => { mat.uniforms.uT.value = rt.driftTime; });

  // drag on empty space turns the ring; release snaps to the nearest slot
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const st = useNexus.getState();
    if (st.openId || st.launcherOpen) return;
    let lastX = e.clientX;
    const move = (ev: PointerEvent) => {
      rt.ringDrag -= ((ev.clientX - lastX) / window.innerWidth) * RING.step * 4;
      lastX = ev.clientX;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      // fold the drag into the spring so motion continues smoothly from here
      const total = rt.ring.x + rt.ringDrag;
      rt.ring.x = total;
      rt.ringDrag = 0;
      const steps = Math.round(total / RING.step) - useNexus.getState().ringIndex;
      if (steps !== 0) dispatch({ type: "ring/rotate", steps }, "mouse");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <mesh material={mat} onPointerDown={onPointerDown} renderOrder={-10}>
      <sphereGeometry args={[40, 32, 16]} />
    </mesh>
  );
}

/* Floor: a faint industrial lattice that fades into the fog. */
const floorVert = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const floorFrag = /* glsl */ `
varying vec3 vW;
float line(vec2 p){ vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }
void main(){
  float dist = length(vW.xz);
  float fade = exp(-dist * 0.11) * smoothstep(0.5, 2.0, dist);
  float v = line(vW.xz) * 0.22 + (1.0 - smoothstep(0.02, 0.045, length(fract(vW.xz + 0.5) - 0.5))) * 0.5;
  gl_FragColor = vec4(vec3(0.35, 0.5, 0.85) * v * fade, v * fade);
}`;

function Floor() {
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: floorVert, fragmentShader: floorFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position-y={-1.45} raycast={() => null}>
      <planeGeometry args={[60, 60]} />
    </mesh>
  );
}

/* Dust: a few hundred soft motes hanging in the fog. They only move while DRIFT is on. */
const dustVert = /* glsl */ `
attribute float aSeed;
uniform float uT;
uniform float uScale;
varying float vA;
void main(){
  vec3 p = position;
  p.y += sin(uT * 0.2 + aSeed * 30.0) * 0.25;
  p.x += cos(uT * 0.13 + aSeed * 20.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uScale * (0.6 + aSeed) * (10.0 / -mv.z);
  vA = smoothstep(18.0, 3.0, -mv.z) * (0.25 + aSeed * 0.5);
  gl_Position = projectionMatrix * mv;
}`;
const dustFrag = /* glsl */ `
varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = exp(-r * r * 16.0) * vA * 0.35;
  if (a < 0.004) discard;
  gl_FragColor = vec4(0.72, 0.82, 1.0, a);
}`;

export const DUST_BY_TIER = [140, 280, 450] as const;

function Dust() {
  const tier = useNexus((s) => s.quality);
  const dpr = useThree((s) => s.viewport.dpr);
  const count = DUST_BY_TIER[tier];
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 1.5 + Math.random() * 12;
      const a = Math.random() * Math.PI * 2;
      pos.set([Math.cos(a) * r, -1.2 + Math.random() * 4, Math.sin(a) * r], i * 3);
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uScale: { value: 2 } } }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    mat.uniforms.uT.value = rt.driftTime;
    mat.uniforms.uScale.value = 2.4 * dpr;
  });
  return <points geometry={geo} material={mat} raycast={() => null} />;
}

export function Atmosphere() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new THREE.FogExp2("#04060c", 0.06);
    scene.background = new THREE.Color("#03050a");
    return () => { scene.fog = null; };
  }, [scene]);
  return (
    <>
      <Backdrop />
      <Floor />
      <Dust />
    </>
  );
}
