"use client";
import * as THREE from "three";
import { BUST } from "./sdf";
import { handPoseGLSL } from "./sdf";
import { LEAVE, ARRIVE } from "@/core/clocks/form";
import { MODULE_IDS } from "@/core/modules";

/**
 * Beads: OPAQUE sphere impostors that write a curved depth — not additive
 * glowing discs. Neighbours meet along curved seams and can overlap enough
 * to leave no gap while each still reads as its own dot.
 *
 * Shading: blue in shadow, lighter blue where the key lands, a glow only
 * where the surface faces the key squarely, and NO rim term — a bright
 * silhouette is exactly what made the first version read as an outline.
 * Every pow of a facing term is clamped: two unit vectors can dot to
 * 1.0000001 and a NaN in one pixel spreads through the whole bloom pyramid.
 */
const N_CARDS = MODULE_IDS.length;

const common = /* glsl */ `
uniform float uBead;
uniform float uViewportH;
uniform mat4 uProj;
varying vec3 vN;
varying vec3 vCenter;
varying float vRadius;
varying vec3 vSrcCol;
varying float vBody;
varying float vSeam;
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
float ease(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
void emit(vec3 world, vec3 nWorld, float radius) {
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vCenter = mv.xyz;
  vRadius = radius;
  vN = normalize(mat3(viewMatrix) * nWorld);
  gl_PointSize = max(1.0, 2.0 * radius * uProj[1][1] * 0.5 * uViewportH / max(-mv.z, 0.01));
  gl_Position = projectionMatrix * mv;
}
`;

const bustVert = /* glsl */ `
${common}
uniform vec3 uOrigin;
uniform float uScale;
uniform float uJaw;
uniform float uYaw;
uniform float uPitch;
uniform float uBreath;
attribute vec3 aRegion;   // jaw, head, chest weights
#ifdef JOURNEY
uniform mat4 uCards[${N_CARDS}];
uniform float uT;
uniform vec3 uCore;
attribute vec4 aSrc;      // xyz: card-local (card ≥ 0) or world; w: card index or −1
attribute vec3 aCoreOff;  // place inside the core / burst direction
attribute vec2 aTime;     // leave, arrive
attribute vec3 aColor;    // source colour: hot text / accent stream / dim glass / dust
#endif
const vec3 J = vec3(${BUST.jawPivot.join(", ")});
const vec3 NP = vec3(${BUST.neckPivot.join(", ")});

void poseBust(inout vec3 p, inout vec3 n) {
  // breath: the chest swells, caused, small
  float c = aRegion.z;
  p.z += c * uBreath * 0.0055 * smoothstep(-0.08, 0.06, p.z);
  p.y += c * uBreath * 0.0018;
  // jaw: hinge about a line through the ears — the chin swings further than the lip
  if (aRegion.x > 0.0) {
    float a = uJaw * aRegion.x;
    p = J + rotX(p - J, a);
    n = rotX(n, a);
  }
  // head: rigid turn about the top of the neck
  float w = aRegion.y;
  p = NP + rotY(rotX(p - NP, uPitch * w), uYaw * w);
  n = rotY(rotX(n, uPitch * w), uYaw * w);
}

void main() {
  vec3 p = position;
  vec3 n = normal;
  // mouth seam: the line between the lips, front of the face only
  vSeam = exp(-pow((p.y - ${BUST.mouthY.toFixed(4)}) / 0.0042, 2.0)) * smoothstep(0.05, 0.075, p.z) * smoothstep(0.03, 0.018, abs(p.x));
  poseBust(p, n);
  vec3 fig = uOrigin + p * uScale;
  float radius = uBead * uScale;
#ifdef JOURNEY
  vec3 src = aSrc.w >= 0.0 ? (uCards[int(aSrc.w + 0.5)] * vec4(aSrc.xyz, 1.0)).xyz : aSrc.xyz;
  float a = ease((uT - aTime.x) / ${LEAVE.travel.toFixed(3)});
  float b = ease((uT - aTime.y) / ${ARRIVE.travel.toFixed(3)});
  // the core breathes and turns while everything is gathered
  float spin = uT * 1.4;
  vec3 core = uCore + rotY(aCoreOff * (0.16 + 0.03 * sin(uT * 3.1 + aCoreOff.y * 20.0)), spin);
  vec3 toCore = mix(src, core, a) + vec3(0.0, 0.32, 0.0) * sin(3.14159 * a) * (0.4 + fract(aCoreOff.x * 17.0));
  // burst outward before landing: core → shell (every direction) → figure
  vec3 shell = uCore + normalize(aCoreOff + 1e-4) * 0.62;
  vec3 q0 = mix(core, shell, b);
  vec3 q1 = mix(shell, fig, b);
  vec3 toFig = mix(q0, q1, b);
  vec3 world = b > 0.0 ? toFig : toCore;
  vBody = b;
  vec3 hot = vec3(0.75, 0.9, 1.7);
  vSrcCol = mix(aColor, hot, a * 0.55);
  float r = mix(radius * 0.62, radius, b);
  emit(world, n, r);
  // not yet left its card: the card face is still drawing this pixel
  if (uT < aTime.x) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
#else
  vBody = 1.0;
  vSrcCol = vec3(0.0);
  emit(fig, n, radius);
#endif
}
`;

const handVert = /* glsl */ `
${common}
uniform mat4 uHand;
uniform float uCurl;
uniform float uThumb;
uniform float uMaterialise;
uniform float uHandScale;
attribute vec3 aRegion;   // bone, materialise seed
${handPoseGLSL()}
void main() {
  vec3 p = position;
  vec3 n = normal;
  poseHand(p, n, aRegion.x, uCurl, uThumb);
  vec3 world = (uHand * vec4(p, 1.0)).xyz;
  vec3 nw = normalize(mat3(uHand) * n);
  vBody = 1.0;
  vSrcCol = vec3(0.0);
  vSeam = 0.0;
  emit(world, nw, uBead * uHandScale);
  // stochastic materialisation — beads arrive one by one, not a ghost fade
  if (aRegion.y > uMaterialise) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}
`;

const frag = /* glsl */ `
uniform mat4 uProj;
uniform vec3 uKey;        // view-space key direction
uniform float uMouth;     // 0..1 discrete steps
uniform float uGlow;
uniform float uFade;
varying vec3 vN;
varying vec3 vCenter;
varying float vRadius;
varying vec3 vSrcCol;
varying float vBody;
varying float vSeam;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  vec3 bn = vec3(c, sqrt(clamp(1.0 - r2, 0.0, 1.0)));
  vec3 sn = normalize(vN);
  vec3 N = normalize(sn * 0.55 + bn * 0.8);
  vec3 K = normalize(uKey);
  float key = clamp(dot(N, K), 0.0, 1.0);
  vec3 shadow = vec3(0.016, 0.042, 0.135);
  vec3 lit = vec3(0.30, 0.48, 0.88);
  vec3 col = mix(shadow, lit, key);
  // glow only where the surface faces the key squarely (clamped pow)
  float facing = clamp(dot(sn, K), 0.0, 1.0);
  col += vec3(0.5, 0.72, 1.0) * pow(facing, 18.0) * 0.32 * uGlow;
  // per-bead specular so each reads as its own dot
  col += vec3(0.7, 0.85, 1.0) * pow(clamp(dot(bn, normalize(K + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 40.0) * 0.25;
  // mouth seam: a thin line that widens with the level — light kept to the seam
  col += vec3(0.72, 0.86, 1.0) * vSeam * uMouth * 2.4;
  col = mix(vSrcCol, col, vBody);
  col *= uFade;
  // curved depth: neighbouring beads meet along curved seams
  vec3 surf = vCenter + vec3(bn.xy * vRadius, bn.z * vRadius);
  vec4 clip = uProj * vec4(surf, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

function baseUniforms() {
  return {
    uBead: { value: 0.004 },
    uViewportH: { value: 1000 },
    uProj: { value: new THREE.Matrix4() },
    uKey: { value: new THREE.Vector3(-0.45, 0.55, 0.7) },
    uMouth: { value: 0 },
    uGlow: { value: 1 },
    uFade: { value: 1 },
  };
}

export function createBustMaterial(journey: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: bustVert,
    fragmentShader: frag,
    defines: journey ? { JOURNEY: "" } : {},
    uniforms: {
      ...baseUniforms(),
      uOrigin: { value: new THREE.Vector3() },
      uScale: { value: 1 },
      uJaw: { value: 0 },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uBreath: { value: 0 },
      uCards: { value: Array.from({ length: N_CARDS }, () => new THREE.Matrix4()) },
      uT: { value: 0 },
      uCore: { value: new THREE.Vector3() },
    },
  });
}

export function createHandMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: handVert,
    fragmentShader: frag,
    uniforms: {
      ...baseUniforms(),
      uHand: { value: new THREE.Matrix4() },
      uCurl: { value: 0.4 },
      uThumb: { value: 0.3 },
      uMaterialise: { value: 0 },
      uHandScale: { value: 1 },
    },
  });
}
