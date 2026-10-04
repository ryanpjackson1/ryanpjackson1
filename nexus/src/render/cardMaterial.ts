import * as THREE from "three";
import { RING } from "./runtime";

/** The plane is a little larger than the card so the glow has room. */
export const MARGIN = 0.16;
export const PLANE_W = RING.cardW + MARGIN * 2;
export const PLANE_H = RING.cardH + MARGIN * 2;

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
uniform sampler2D uFace;
uniform vec3 uAccent;
uniform float uHover;
uniform float uSelected;
uniform float uHeld;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 plane = vec2(${PLANE_W.toFixed(4)}, ${PLANE_H.toFixed(4)});
  vec2 card = vec2(${RING.cardW.toFixed(4)}, ${RING.cardH.toFixed(4)});
  vec2 p = (vUv - 0.5) * plane;
  vec2 cuv = p / card + 0.5;
  float d = sdRoundRect(p, card * 0.5, 0.06);
  float aa = fwidth(d) * 1.2;
  float inside = 1.0 - smoothstep(-aa, aa, d);

  // glass: dark, cool, slightly brighter toward the top, fresnel at grazing angles
  float facing = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
  float fres = pow(clamp(1.0 - facing, 0.0, 1.0), 2.0);
  vec3 glass = mix(vec3(0.014, 0.024, 0.05), vec3(0.035, 0.06, 0.11), cuv.y) + uAccent * 0.025;
  float streak = exp(-pow((cuv.x + cuv.y * 0.6 - 0.55 - vV.x * 0.8) * 6.0, 2.0)) * 0.06;
  glass += vec3(0.8, 0.88, 1.0) * (streak + fres * 0.12);

  vec4 ink = texture2D(uFace, cuv);
  vec3 col = glass + ink.rgb * ink.a;
  float alpha = 0.5 + ink.a * 0.5;

  // border: thin rim; brighter on hover/selection; a slow highlight runs round it
  float rim = exp(-abs(d) * 170.0);
  float ang = atan(p.y, p.x);
  float run = pow(clamp(0.5 + 0.5 * sin(ang - uTime * 0.8), 0.0, 1.0), 10.0);
  vec3 blue = mix(vec3(0.62, 0.76, 1.0), uAccent, 0.4);
  col += blue * rim * inside * (0.45 + uHover * 0.5 + uSelected * 0.7 + uHeld * 0.6 + run * 0.35);

  // soft outer glow
  float outside = max(d, 0.0);
  float edge = smoothstep(0.0, 0.12, min(min(vUv.x, 1.0 - vUv.x) * plane.x, min(vUv.y, 1.0 - vUv.y) * plane.y));
  float glow = exp(-outside * 24.0) * (1.0 - inside) * edge * (0.05 + uHover * 0.12 + uSelected * 0.18 + uHeld * 0.15);

  vec3 outCol = col * inside + blue * (1.0 - inside);
  float outA = (alpha * inside + glow) * uOpacity;
  if (outA < 0.003) discard;
  gl_FragColor = vec4(outCol, outA);
}`;

export function createCardMaterial(face: THREE.Texture, accent: THREE.Color) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uFace: { value: face },
      uAccent: { value: accent },
      uHover: { value: 0 },
      uSelected: { value: 0 },
      uHeld: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    },
  });
}
