"use client";
import * as THREE from "three";
import { RING } from "@/core/runtime";

/** Plane is larger than the card so the outer glow has room to bloom. */
export const HALO = 0.26;
export const PLANE_W = RING.cardW + HALO * 2;
export const PLANE_H = RING.cardH + HALO * 2;

/**
 * GLSL shared verbatim by the card face and the dissolve particles, so
 * the face erodes edge-first on exactly the curve its particles leave on.
 *   edge(uv)  = 0 at the rim … 1 at the centre
 *   leave(uv) = start + smoothstep(0,1,edge) * span
 */
export const ERODE_GLSL = /* glsl */ `
float nxEdge(vec2 uv) {
  vec2 e = min(uv, 1.0 - uv) * 2.0;
  return clamp(min(e.x * 1.12, e.y), 0.0, 1.0);
}
float nxLeave(vec2 uv, float start, float span) {
  float e = nxEdge(uv);
  return start + e * e * (3.0 - 2.0 * e) * span;
}
`;

const vertex = /* glsl */ `
uniform float uTime;
uniform vec3 uRipple;      // (startTime, u, v)
varying vec2 vUv;
varying vec3 vViewN;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec3 p = position;
  // Glass bends: a travelling ripple displaces the pane along its normal.
  float age = uTime - uRipple.x;
  if (age > 0.0 && age < 2.5) {
    vec2 rp = (vec2(uRipple.y, uRipple.z) - 0.5) * vec2(${PLANE_W.toFixed(3)}, ${PLANE_H.toFixed(3)});
    float d = length(p.xy - rp);
    p.z += sin(d * 18.0 - age * 11.0) * exp(-age * 2.4) * exp(-d * 1.6) * 0.035;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewN = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
uniform sampler2D uFace;
uniform vec3 uAccent;
uniform float uTime;
uniform float uHover;
uniform float uSelectT;     // time selection pulse fired
uniform float uSelected;    // 0..1
uniform float uGold;        // 0..1, earned by centring (power curve applied on CPU)
uniform float uWarn;        // 0..1
uniform float uOpacity;
uniform float uDim;
uniform float uScan;        // -1 or 0..1
uniform vec3 uRipple;
uniform float uFormT;       // human-form master clock T
uniform float uLeaveStart;
uniform float uLeaveSpan;
uniform float uSpeech;
varying vec2 vUv;
varying vec3 vViewN;
varying vec3 vViewDir;

${ERODE_GLSL}

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 plane = vec2(${PLANE_W.toFixed(4)}, ${PLANE_H.toFixed(4)});
  vec2 card = vec2(${RING.cardW.toFixed(4)}, ${RING.cardH.toFixed(4)});
  vec2 p = (vUv - 0.5) * plane;                 // metres, card-centred
  vec2 cuv = p / card + 0.5;                    // 0..1 across the card face
  float d = sdRoundRect(p, card * 0.5, 0.07);   // <0 inside
  float aa = fwidth(d) * 1.2;
  float inside = 1.0 - smoothstep(-aa, aa, d);

  // ── Phase 7 erosion: the same leave(uv) its particles use ─────────────
  float leaveAt = nxLeave(clamp(cuv, 0.0, 1.0), uLeaveStart, uLeaveSpan);
  float eroded = step(leaveAt, uFormT);
  float front = smoothstep(leaveAt - 0.12, leaveAt, uFormT) * step(uFormT, leaveAt);  // hot rim in the instant before leaving
  if (inside > 0.0 && eroded > 0.5) inside = 0.0;

  // ── glass body ────────────────────────────────────────────────────────
  float fres = pow(clamp(1.0 - abs(dot(normalize(vViewN), normalize(vViewDir))), 0.0, 1.0), 2.0);
  vec3 glass = mix(vec3(0.012, 0.022, 0.048), vec3(0.03, 0.05, 0.10), cuv.y);
  glass += uAccent * 0.035;
  // reflection streak that slides with view angle
  float streakPos = 0.35 + vViewDir.x * 0.9 + vViewDir.y * 0.4;
  float streak = exp(-pow((cuv.x + cuv.y * 0.55 - streakPos) * 7.0, 2.0)) * 0.10;
  glass += vec3(0.75, 0.85, 1.0) * (streak * 0.7 + fres * 0.12);

  // ripple refraction offset for the face
  vec2 fuv = cuv;
  float rAge = uTime - uRipple.x;
  if (rAge > 0.0 && rAge < 2.5) {
    vec2 rp = vec2(uRipple.y, uRipple.z);
    vec2 dir = cuv - rp;
    float dist = length(dir);
    fuv += normalize(dir + 1e-5) * sin(dist * 40.0 - rAge * 12.0) * exp(-rAge * 2.6) * 0.006;
  }
  vec4 ink = texture2D(uFace, fuv);  // CanvasTexture is flipY: cuv (0,0) = canvas bottom-left
  vec3 col = glass + ink.rgb * ink.a * (1.0 + uHover * 0.15);
  float alpha = 0.46 + ink.a * 0.5 + uHover * 0.08;

  // ── borders ──────────────────────────────────────────────────────────
  float rim = exp(-abs(d) * 160.0);
  float ang = atan(p.y, p.x);
  float run = pow(clamp(0.5 + 0.5 * sin(ang - uTime * 1.3), 0.0, 1.0), 14.0);
  vec3 blue = mix(vec3(0.55, 0.72, 1.0), uAccent, 0.45);
  // Blue is allowed to run hot; it reads as blue even when it blooms.
  vec3 border = blue * (0.55 + uHover * 0.5 + uSelected * 0.6 + run * 0.9 + uSpeech * 0.4);

  // Gold rules (Phase 6):
  //  1. A warned card can NEVER be gold: the gold term is gated off by the warning flag.
  //  2. Gold is drawn DIMMER than blue (multipliers stay ≤ 1.0 so red/green never
  //     clip to white); its prominence comes from hue and a wider outer bloom.
  float warnGate = 1.0 - step(0.001, uWarn);
  float gold = uGold * warnGate;
  vec3 goldCol = vec3(0.86, 0.64, 0.27);
  border = mix(border, goldCol * (0.82 + run * 0.18), gold);
  // warning orange (~18° from gold, never mixed with it)
  vec3 warnCol = vec3(1.0, 0.45, 0.14);
  float warnPulse = 0.6 + 0.4 * sin(uTime * 3.2);
  border = mix(border, warnCol * warnPulse, uWarn);
  col = mix(col, col + goldCol * 0.10, gold);                   // glass emissive warms
  col += border * rim * inside * 1.4;

  // ── energy pulse on selection ────────────────────────────────────────
  float pAge = uTime - uSelectT;
  if (pAge > 0.0 && pAge < 1.4) {
    float ring = exp(-pow((length(p) - pAge * 1.1) * 18.0, 2.0)) * (1.0 - pAge / 1.4);
    col += blue * ring * 1.6 * inside;
  }

  // ── hard-edged scan line (presentation APPROACH) ──────────────────────
  if (uScan >= 0.0) {
    float y = 1.0 - uScan;
    float line = step(abs(cuv.y - y), 0.0035);
    // faint trailing fill above the line (already-scanned region)
    float wake = step(y, cuv.y) * (1.0 - smoothstep(y, y + 0.2, cuv.y)) * 0.12;
    col += vec3(0.85, 0.93, 1.0) * (line * 1.8 + wake) * inside;
  }

  // erosion rim heats up just before the face leaves
  col += vec3(0.8, 0.9, 1.0) * front * inside * 1.4;

  // ── outer halo: wider for gold (prominence by bloom, not brightness) ──
  float outside = max(d, 0.0);
  float haloW = mix(28.0, 15.0, gold);
  float edgeFade = smoothstep(0.0, 0.16, min(min(vUv.x, 1.0 - vUv.x) * plane.x, min(vUv.y, 1.0 - vUv.y) * plane.y));
  float halo = exp(-outside * haloW) * (1.0 - inside) * edgeFade;
  vec3 haloCol = mix(blue * 0.5, goldCol * 0.75, gold);
  haloCol = mix(haloCol, warnCol * 0.6, uWarn);
  float haloA = halo * (0.10 + uHover * 0.12 + uSelected * 0.12 + gold * 0.32 + uWarn * 0.25);
  haloA *= step(uFormT, uLeaveStart + 0.01);

  vec3 outCol = col * inside + haloCol * (1.0 - inside);
  float outA = alpha * inside + haloA;
  outCol *= (1.0 - uDim * 0.85);
  gl_FragColor = vec4(outCol, outA * uOpacity);
  if (gl_FragColor.a < 0.002) discard;
}
`;

export function createCardMaterial(face: THREE.Texture, accent: [number, number, number]) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uFace: { value: face },
      uAccent: { value: new THREE.Color(...accent) },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uSelectT: { value: -10 },
      uSelected: { value: 0 },
      uGold: { value: 0 },
      uWarn: { value: 0 },
      uOpacity: { value: 1 },
      uDim: { value: 0 },
      uScan: { value: -1 },
      uRipple: { value: new THREE.Vector3(-10, 0.5, 0.5) },
      uFormT: { value: 0 },
      uLeaveStart: { value: 99 },
      uLeaveSpan: { value: 1 },
      uSpeech: { value: 0 },
    },
  });
}
