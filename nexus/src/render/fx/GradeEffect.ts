"use client";
import * as THREE from "three";
import { Effect, EffectAttribute } from "postprocessing";

/**
 * Full-screen film grade (Phase 6).
 *
 *  · Splits the ends of the blue luminance ramp: violet into the shadows,
 *    warm white into the highlights. Tints are luminance-normalised so the
 *    split moves hue, not exposure; mid-tones are left untouched.
 *  · Filmic contrast pivots at 18% grey (in log space).
 *  · Halation: a red-orange bleed around highlights, film-style.
 *  · Crossover spike: split + halation surge at the midpoint of a world
 *    change so it reads as a cut.
 *  · NaN guard: one NaN pixel would spread through the bloom pyramid.
 */
const fragment = /* glsl */ `
uniform vec3 uShadow;
uniform vec3 uHighlight;
uniform float uSplit;
uniform float uContrast;
uniform float uWarmth;
uniform float uHalation;
uniform float uBleed;
uniform float uSat;
uniform float uCross;
uniform float uWake;
uniform float uVignette;
uniform float uFade;

const vec3 LW = vec3(0.2126, 0.7152, 0.0722);

// luminance-normalised tint, softened: the split moves hue, it doesn't repaint the frame
vec3 tintKeepLuma(vec3 tint) { return mix(vec3(1.0), tint / max(dot(tint, LW), 1e-3), 0.32); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, vec3(0.0));
  float cross = uCross;
  float split = uSplit * (1.0 + cross * 1.6);
  float halation = uHalation * (1.0 + cross * 2.4);

  // halation: sample a ring of highlights around this pixel
  vec2 px = texelSize * 6.0 * uBleed;
  vec3 hi = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec3 s = texture2D(inputBuffer, uv + vec2(cos(a), sin(a)) * px).rgb;
    hi += max(s - 0.65, 0.0);
  }
  hi /= 8.0;
  c += hi * vec3(1.0, 0.32, 0.12) * halation;

  // filmic contrast around the 18% grey pivot (log space)
  vec3 lc = log2(max(c, vec3(1e-5)) / 0.18);
  c = 0.18 * exp2(lc * uContrast);

  // split toning on the luminance ramp; mid-tones untouched
  float l = dot(c, LW);
  float ws = 1.0 - smoothstep(0.0, 0.16, l);
  float wh = smoothstep(0.42, 1.1, l);
  c = mix(c, c * tintKeepLuma(uShadow), clamp(ws * split, 0.0, 1.0));
  c = mix(c, c * tintKeepLuma(uHighlight), clamp(wh * split, 0.0, 1.0));

  // global warmth (negative = blue hour)
  c *= vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.15, 1.0 - uWarmth);

  // saturation
  l = dot(c, LW);
  c = mix(vec3(l), c, uSat);

  // wake glow — the whole interface lights up
  float r = length(uv - 0.5);
  c += vec3(0.35, 0.55, 1.0) * uWake * 0.16 * (1.0 - r);

  // vignette (released while embodied so it can't crop the bust)
  c *= mix(1.0, smoothstep(0.95, 0.25, r), uVignette);

  c *= uFade;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  outputColor = vec4(max(c, vec3(0.0)), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", fragment, {
      attributes: EffectAttribute.NONE,
      uniforms: new Map<string, THREE.Uniform>([
        ["uShadow", new THREE.Uniform(new THREE.Vector3(0.32, 0.18, 0.62))],
        ["uHighlight", new THREE.Uniform(new THREE.Vector3(1.0, 0.94, 0.84))],
        ["uSplit", new THREE.Uniform(0.4)],
        ["uContrast", new THREE.Uniform(1.08)],
        ["uWarmth", new THREE.Uniform(0)],
        ["uHalation", new THREE.Uniform(0.18)],
        ["uBleed", new THREE.Uniform(1)],
        ["uSat", new THREE.Uniform(1)],
        ["uCross", new THREE.Uniform(0)],
        ["uWake", new THREE.Uniform(0)],
        ["uVignette", new THREE.Uniform(0.7)],
        ["uFade", new THREE.Uniform(1)],
      ]),
    });
  }
  u(name: string) {
    return this.uniforms.get(name)!;
  }
}
