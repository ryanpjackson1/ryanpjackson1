"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { rt, nowS } from "@/core/runtime";
import { formClock } from "@/core/clocks/form";
import { live } from "./worldState";
import { useNexus } from "@/stores/nexus";

const FLOOR_Y = -1.75;
const FLOOR_KINDS = ["lattice", "grid", "glass", "deck", "water", "none"] as const;

/* ─────────────────────────── Backdrop ─────────────────────────── */
const backdropFrag = /* glsl */ `
uniform vec3 uFog; uniform vec3 uFill; uniform vec3 uKey; uniform float uT; uniform float uDim; uniform float uWake;
varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float horizon = exp(-abs(d.y + 0.08) * 5.0);
  float fog = fbm(d * 2.6 + vec3(uT * 0.012, 0.0, uT * 0.008));
  float band = fbm(vec3(d.x * 1.3, d.y * 7.0 - uT * 0.004, d.z * 1.3));
  vec3 col = uFog * (0.7 + 0.6 * fog);
  col += uFill * horizon * 0.05 * (0.6 + band);
  col += uKey * pow(clamp(d.y * 0.5 + 0.5, 0.0, 1.0), 6.0) * 0.05;
  col += uFill * uWake * 0.25 * horizon;
  col *= 1.0 - uDim * 0.75;
  gl_FragColor = vec4(col, 1.0);
}`;
const backdropVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function Backdrop() {
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: backdropVert, fragmentShader: backdropFrag, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uFog: { value: new THREE.Color() }, uFill: { value: new THREE.Color() }, uKey: { value: new THREE.Color() }, uT: { value: 0 }, uDim: { value: 0 }, uWake: { value: 0 } },
    }),
    [],
  );
  useFrame(() => {
    const u = mat.uniforms;
    u.uFog.value.copy(live.fog);
    u.uFill.value.copy(live.fill);
    u.uKey.value.copy(live.key);
    u.uT.value = rt.driftTime;
    const f = formClock.envelopes();
    u.uDim.value = f.dim * 0.6 + f.atmosphereGone * 0.3;
    u.uWake.value = wakeEnvelope();
  });
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[60, 48, 24]} />
    </mesh>
  );
}

export function wakeEnvelope() {
  if (rt.wakeAt < 0) return 0;
  const a = nowS() - rt.wakeAt;
  return a < 0 || a > 3 ? 0 : Math.sin(Math.min(1, a / 0.25) * Math.PI * 0.5) * (1 - a / 3);
}

/* ─────────────────────────── Dust ─────────────────────────── */
const dustVert = /* glsl */ `
attribute float aSeed;
uniform float uT; uniform float uSize; uniform vec3 uHand; uniform float uHandOn; uniform float uWakeR; uniform float uWakeOn;
varying float vA; varying float vSeed;
void main(){
  vec3 p = position;
  // slow volumetric flow (uT only advances while DRIFT is on)
  p.x += sin(uT * 0.11 + aSeed * 6.28) * 0.6;
  p.y = mod(p.y + uT * (0.03 + aSeed * 0.05) + 2.0, 7.0) - 2.0;
  p.z += cos(uT * 0.09 + aSeed * 4.0) * 0.6;
  // particles react to the hand
  vec3 dh = p - uHand; float dl = length(dh);
  p += normalize(dh + 1e-4) * uHandOn * 0.55 * exp(-dl * dl * 1.4);
  // wake wave pushes the dust outward
  float rr = length(p.xz);
  p.xz += normalize(p.xz + 1e-4) * uWakeOn * 0.5 * exp(-pow((rr - uWakeR) * 1.6, 2.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed) * (14.0 / -mv.z);
  vA = smoothstep(26.0, 3.0, -mv.z) * smoothstep(0.3, 1.2, -mv.z);
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;
const dustFrag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
varying float vA; varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c);
  float a = exp(-r * r * 14.0);                       // gaussian mote, no hard core
  a *= vA * uAlpha * (0.12 + vSeed * 0.28);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * 0.8, a);
}`;

function Dust() {
  const tier = useNexus((s) => s.tier);
  const count = [1400, 2600, 4200, 6000][tier] ?? 2600;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 1.6 + Math.pow(Math.random(), 0.7) * 15;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -2 + Math.random() * 7;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: 0 }, uSize: { value: 2.2 }, uColor: { value: new THREE.Color("#9cc3ff") }, uAlpha: { value: 0.8 },
        uHand: { value: new THREE.Vector3(0, 0, -99) }, uHandOn: { value: 0 }, uWakeR: { value: 0 }, uWakeOn: { value: 0 },
      },
    }),
    [],
  );
  const handV = useRef(new THREE.Vector3());
  useFrame(() => {
    const u = mat.uniforms;
    u.uT.value = rt.driftTime;
    const f = formClock.envelopes();
    u.uAlpha.value = (0.5 + live.dust * 0.25) * (1 - f.atmosphereGone) * (1 - f.dim * 0.4);
    u.uColor.value.copy(live.beam).lerp(new THREE.Color("#ffffff"), 0.15);
    const h = rt.hands[0];
    if (h.present && rt.camera) {
      handV.current.set(h.px, h.py, 0.5).unproject(rt.camera).sub(rt.camera.position).normalize().multiplyScalar(3).add(rt.camera.position);
      u.uHand.value.copy(handV.current);
      u.uHandOn.value = Math.min(1, u.uHandOn.value + 0.05);
    } else u.uHandOn.value = Math.max(0, u.uHandOn.value - 0.03);
    const wa = rt.wakeAt < 0 ? 99 : nowS() - rt.wakeAt;
    u.uWakeR.value = wa * 7;
    u.uWakeOn.value = wa < 3 ? 1 - wa / 3 : 0;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={1} />;
}

/* ─────────────────────────── Light shafts ─────────────────────────── */
const beamFrag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
void main(){
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float a = pow(across, 2.5) * smoothstep(0.0, 0.35, vUv.y) * pow(vUv.y, 0.6);
  gl_FragColor = vec4(uColor, a * uAlpha);
}`;
const beamVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function Beams() {
  const MAX = 6;
  const group = useRef<THREE.Group>(null);
  const mats = useMemo(
    () => Array.from({ length: MAX }, () => new THREE.ShaderMaterial({
      vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
    })),
    [],
  );
  const seeds = useMemo(() => Array.from({ length: MAX }, (_, i) => ({ a: (i / MAX) * Math.PI * 2 + 0.4, r: 4 + (i % 3) * 2.4, tilt: 0.25 + (i % 2) * 0.15 })), []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const f = formClock.envelopes();
    g.children.forEach((c, i) => {
      const s = seeds[i];
      const sway = Math.sin(rt.driftTime * 0.07 + i * 1.3) * 0.35; // gated: driftTime frozen when LOCKED
      c.position.set(Math.cos(s.a + sway * 0.2) * s.r, 2.2, Math.sin(s.a + sway * 0.2) * s.r);
      c.rotation.set(0, -s.a, s.tilt + sway * 0.1);
      const m = mats[i];
      m.uniforms.uColor.value.copy(live.beam);
      const on = Math.max(0, Math.min(1, live.beams - i));
      m.uniforms.uAlpha.value = 0.06 * on * (1 - f.atmosphereGone) * (1 + live.weather.sun * 1.5) * (1 + rt.speech * 0.6);
    });
  });
  return (
    <group ref={group}>
      {mats.map((m, i) => (
        <mesh key={i} material={m} renderOrder={1}>
          <planeGeometry args={[1.4, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────── Floor ─────────────────────────── */
const floorVert = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const floorFrag = /* glsl */ `
uniform vec3 uColor; uniform vec3 uKey; uniform float uT; uniform float uAlpha;
uniform float uKind[6];           // lattice grid glass deck water none (blend weights)
uniform float uMarket; uniform float uSeries[32]; uniform float uWakeR; uniform float uWakeOn; uniform float uRain;
varying vec3 vW;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gridLine(vec2 p, float scale, float w){ vec2 g = abs(fract(p * scale - 0.5) - 0.5) / fwidth(p * scale); return 1.0 - min(min(g.x, g.y) / w, 1.0); }
void main(){
  vec2 p = vW.xz;
  float dist = length(p);
  float fade = exp(-dist * 0.085) * smoothstep(0.0, 1.5, dist);
  // lattice: faint lines + a bright dot at every intersection
  float lattice = gridLine(p, 1.0, 1.0) * 0.30 + (1.0 - smoothstep(0.02, 0.05, length(fract(p + 0.5) - 0.5))) * 0.8;
  float grid = gridLine(p, 2.0, 1.2) * 0.45 + gridLine(p, 0.25, 1.5) * 0.5;
  float glass = 0.12 * exp(-dist * 0.12) + gridLine(p, 0.5, 0.8) * 0.12;
  // deck: 2 m plates with a rivet in each corner
  float deck = gridLine(p, 0.5, 2.0) * 0.6 + (1.0 - smoothstep(0.0, 0.05, length(fract(p * 0.5) - vec2(0.1)))) * 0.6;
  float water = (0.5 + 0.5 * sin(p.x * 1.7 + uT * 0.6 + sin(p.y * 1.1 + uT * 0.4) * 2.0)) * 0.10 + gridLine(p, 0.25, 1.0) * 0.08;
  float v = lattice * uKind[0] + grid * uKind[1] + glass * uKind[2] + deck * uKind[3] + water * uKind[4];
  vec3 col = uColor * v;
  // ── Stocks: the floor becomes an animated market grid ──
  if (uMarket > 0.01) {
    vec2 mp = p * vec2(1.6, 1.6);
    float col32 = clamp(floor(mod(mp.x + 16.0 + uT * 0.6, 32.0)), 0.0, 31.0);
    int ix = int(col32);
    float hgt = 0.0;
    for (int i = 0; i < 32; i++) { if (i == ix) hgt = uSeries[i]; }
    float row = fract(mp.y * 0.12);
    float bar = step(abs(fract(mp.x) - 0.5), 0.32) * step(row, hgt * 0.9 + 0.05);
    float ticks = gridLine(mp, 1.0, 1.0) * 0.25;
    vec3 mcol = mix(vec3(0.35, 0.55, 1.0), vec3(0.45, 0.95, 1.0), hgt);
    col += mcol * (bar * 0.55 + ticks) * uMarket;
  }
  // wake wave
  col += uKey * uWakeOn * exp(-pow((dist - uWakeR) * 2.2, 2.0)) * 0.9;
  // rain rings
  if (uRain > 0.01) {
    vec2 rc = floor(p * 1.5); vec2 rf = fract(p * 1.5) - 0.5;
    float ph = fract(uT * 0.9 + h1(rc));
    float ring = exp(-pow((length(rf) - ph * 0.45) * 40.0, 2.0)) * (1.0 - ph);
    col += uKey * ring * uRain * 0.35;
  }
  gl_FragColor = vec4(col * fade, fade * uAlpha);
}`;

function Floor() {
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: floorVert, fragmentShader: floorFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      extensions: { derivatives: true } as never,
      uniforms: {
        uColor: { value: new THREE.Color() }, uKey: { value: new THREE.Color() }, uT: { value: 0 }, uAlpha: { value: 1 },
        uKind: { value: [1, 0, 0, 0, 0, 0] }, uMarket: { value: 0 }, uSeries: { value: new Array(32).fill(0) },
        uWakeR: { value: 0 }, uWakeOn: { value: 0 }, uRain: { value: 0 },
      },
    }),
    [],
  );
  const clock = useRef(0);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    // market grid and rain are reports of data, not ambient drift — they run whenever shown
    clock.current += dt * Math.max(rt.motion, live.market, live.weather.rain > 0.05 ? 1 : 0);
    u.uT.value = clock.current;
    u.uColor.value.copy(live.fill).lerp(live.key, 0.35).multiplyScalar(0.3);
    u.uKey.value.copy(live.key);
    const e = live.t * live.t * (3 - 2 * live.t);
    const kinds = u.uKind.value as number[];
    FLOOR_KINDS.forEach((k, i) => {
      kinds[i] = (live.floorFrom === k ? 1 - e : 0) + (live.floorTo === k ? e : 0);
    });
    const f = formClock.envelopes();
    u.uAlpha.value = 1 - f.atmosphereGone;
    u.uMarket.value = live.market;
    const series = useNexus.getState().payloads.stocks?.series;
    if (series && series.length > 1) {
      let lo = Infinity, hi = -Infinity;
      for (const v of series) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const arr = u.uSeries.value as number[];
      for (let i = 0; i < 32; i++) {
        const v = series[Math.floor((i / 31) * (series.length - 1))];
        arr[i] = (v - lo) / (hi - lo || 1);
      }
    }
    const wa = rt.wakeAt < 0 ? 99 : nowS() - rt.wakeAt;
    u.uWakeR.value = wa * 7;
    u.uWakeOn.value = wa < 3 ? 1 - wa / 3 : 0;
    u.uRain.value = live.weather.rain + live.weather.storm;
  });
  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position-y={FLOOR_Y} renderOrder={0}>
      <planeGeometry args={[90, 90]} />
    </mesh>
  );
}

/* ─────────────────────────── Fog binding ─────────────────────────── */
function FogBinding() {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.FogExp2(live.fog.getHex(), live.fogDensity), []);
  scene.fog = fog;
  useFrame(() => {
    fog.color.copy(live.fog);
    fog.density = live.fogDensity;
  });
  return null;
}

export function Atmosphere() {
  return (
    <>
      <FogBinding />
      <Backdrop />
      <Floor />
      <Beams />
      <Dust />
    </>
  );
}
export { FLOOR_Y };
