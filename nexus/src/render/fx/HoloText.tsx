"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { holo } from "./holoBus";
import { formClock } from "@/core/clocks/form";
import { CORE } from "@/render/form/schedule";

/**
 * AI responses appear in space, not in chat bubbles. Each sentence is
 * rasterised, sampled, and ASSEMBLED FROM PARTICLES that fly in from a
 * scattered cloud; once assembled the crisp glyphs cross-fade in so the
 * sentence stays readable. The previous sentence drifts up and fades.
 */
const N = 5200;
const W = 1600, H = 200;
const PLANE_W = 2.6;
const PLANE_H = (PLANE_W * H) / W;

function rasterise(text: string) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.textAlign = "center";
  let size = 64;
  g.font = `400 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  // wrap to two lines max
  const words = text.split(/\s+/);
  let lines: string[] = [];
  const wrap = () => {
    lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (g.measureText(t).width > W - 60 && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
  };
  wrap();
  while (lines.length > 2 && size > 30) { size -= 6; g.font = `400 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`; wrap(); }
  lines = lines.slice(0, 2);
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  return c;
}

const vert = /* glsl */ `
attribute vec3 aFrom;
attribute float aDelay;
uniform float uT;
varying float vA;
void main(){
  float k = clamp((uT - aDelay) / 0.9, 0.0, 1.0);
  k = 1.0 - pow(1.0 - k, 3.0);
  vec3 p = mix(aFrom, position, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = mix(3.5, 1.8, k) * (2.6 / -mv.z);
  vA = k * (1.0 - smoothstep(1.6, 2.6, uT));
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform float uFade; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.75, 0.88, 1.4, vA * uFade * (1.0 - d * 1.6)); }`;

export function HoloText() {
  const group = useRef<THREE.Group>(null);
  const pts = useRef<THREE.Points>(null);
  const crisp = useRef<THREE.Mesh>(null);
  const prev = useRef<THREE.Mesh>(null);
  const t = useRef(99);
  const fadeOut = useRef(0);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("aFrom", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute("aDelay", new THREE.BufferAttribute(new Float32Array(N), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 99 }, uFade: { value: 1 } } }), []);
  const crispMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(0.85, 0.93, 1.25), toneMapped: false }), []);
  const prevMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(0.7, 0.8, 1.1), toneMapped: false }), []);

  useEffect(() => holo.on((s) => {
    if (!s) { fadeOut.current = 1; return; }
    fadeOut.current = 0;
    // previous sentence moves up and fades
    if (crispMat.map) {
      prevMat.map?.dispose();
      prevMat.map = crispMat.map;
      prevMat.needsUpdate = true;
      prevMat.opacity = crispMat.opacity * 0.6;
      if (prev.current) prev.current.position.y = PLANE_H * 1.05;
    }
    const c = rasterise(s);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    crispMat.map = tex;
    crispMat.opacity = 0;
    crispMat.needsUpdate = true;
    const data = c.getContext("2d")!.getImageData(0, 0, W, H).data;
    const ink: number[] = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 120) ink.push(x, y);
    const pos = geo.attributes.position.array as Float32Array;
    const from = geo.attributes.aFrom.array as Float32Array;
    const del = geo.attributes.aDelay.array as Float32Array;
    const n = ink.length / 2;
    for (let i = 0; i < N; i++) {
      if (!n) { pos[i * 3] = 0; pos[i * 3 + 1] = -99; pos[i * 3 + 2] = 0; continue; }
      const j = Math.floor(Math.random() * n) * 2;
      const px = (ink[j] / W - 0.5) * PLANE_W, py = (0.5 - ink[j + 1] / H) * PLANE_H;
      pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = 0;
      from[i * 3] = px * 1.6 + (Math.random() - 0.5) * 2.4;
      from[i * 3 + 1] = py + (Math.random() - 0.5) * 1.4;
      from[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      del[i] = (ink[j] / W) * 0.45 + Math.random() * 0.15; // assembles left → right, like reading
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aFrom.needsUpdate = true;
    geo.attributes.aDelay.needsUpdate = true;
    t.current = 0;
  }), [geo, crispMat, prevMat]);

  useFrame((state, dt) => {
    t.current += dt;
    mat.uniforms.uT.value = t.current;
    const g = group.current;
    if (!g) return;
    const f = formClock.envelopes();
    // in human form the text sits low-left of the figure; otherwise above the ring
    const embodied = f.presence;
    g.position.set(
      THREE.MathUtils.lerp(0, CORE.x - 0.45, embodied),
      THREE.MathUtils.lerp(0.98, CORE.y + 0.16, embodied),
      THREE.MathUtils.lerp(-2.9, CORE.z + 0.05, embodied),
    );
    g.scale.setScalar(THREE.MathUtils.lerp(1, 0.2, embodied));
    g.quaternion.copy(state.camera.quaternion);
    const assembled = THREE.MathUtils.smoothstep(t.current, 1.0, 1.7);
    const alive = 1 - THREE.MathUtils.smoothstep(t.current, 9, 11);
    crispMat.opacity = assembled * alive * (1 - fadeOut.current);
    prevMat.opacity = Math.max(0, prevMat.opacity - dt * 0.5);
    if (prev.current) prev.current.position.y += dt * 0.04;
    mat.uniforms.uFade.value = (1 - fadeOut.current) * (1 - f.dim * (1 - embodied));
  });

  return (
    <group ref={group}>
      <points ref={pts} geometry={geo} material={mat} frustumCulled={false} renderOrder={8} />
      <mesh ref={crisp} material={crispMat} renderOrder={9}>
        <planeGeometry args={[PLANE_W, PLANE_H]} />
      </mesh>
      <mesh ref={prev} material={prevMat} renderOrder={9}>
        <planeGeometry args={[PLANE_W, PLANE_H]} />
      </mesh>
    </group>
  );
}
