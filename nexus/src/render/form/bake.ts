"use client";
import * as THREE from "three";
import { SDF_LIB } from "./sdf";

/**
 * GPU surface bake. Seed points fill the bounds (one per texel, from an
 * integer hash), Newton steps in a fragment shader pull each one onto the
 * zero set of the field, and the result is read back packed into 16-bit
 * pairs of an RGBA8 target — readable everywhere, ~10 µm precision over
 * the bounds. Three passes: (x,y), (z,valid), (octahedral normal).
 * Returns once; from then on the figure is a static point set.
 */
export interface Candidates {
  pos: Float32Array;   // xyz
  nrm: Float32Array;   // xyz
  count: number;
}

const vert = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = (field: string) => /* glsl */ `
precision highp float;
precision highp int;
uniform vec3 uMin;
uniform vec3 uMax;
uniform int uPass;
uniform uint uSeed;
${SDF_LIB}
${field}

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
vec3 hash3(uvec2 q) {
  uint a = pcg(q.x + pcg(q.y + uSeed));
  uint b = pcg(a);
  uint c = pcg(b);
  return vec3(a, b, c) / 4294967295.0;
}
vec3 grad(vec3 p) {
  const float e = 2e-4;
  return vec3(
    sdFigure(p + vec3(e,0,0)) - sdFigure(p - vec3(e,0,0)),
    sdFigure(p + vec3(0,e,0)) - sdFigure(p - vec3(0,e,0)),
    sdFigure(p + vec3(0,0,e)) - sdFigure(p - vec3(0,0,e))) / (2.0 * e);
}
vec2 pack16(float v) {           // v in [0,1] → two bytes
  float x = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(x / 256.0);
  return vec2(hi, x - hi * 256.0) / 255.0;
}
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}
void main() {
  vec3 size = uMax - uMin;
  vec3 p = uMin + hash3(uvec2(gl_FragCoord.xy)) * size;
  for (int i = 0; i < 28; i++) {
    float d = sdFigure(p);
    vec3 g = grad(p);
    p -= d * g / max(dot(g, g), 1e-6);
  }
  float d = sdFigure(p);
  vec3 g = grad(p);
  bool inside = all(greaterThanEqual(p, uMin)) && all(lessThanEqual(p, uMax));
  float valid = (abs(d) < 3e-4 && inside && dot(g, g) > 0.25) ? 1.0 : 0.0;
  vec3 u = (p - uMin) / size;
  if (uPass == 0) gl_FragColor = vec4(pack16(u.x), pack16(u.y));
  else if (uPass == 1) gl_FragColor = vec4(pack16(u.z), valid, 1.0);
  else gl_FragColor = vec4(pack16(octEncode(normalize(g)).x), pack16(octEncode(normalize(g)).y));
}
`;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function octDecode(x: number, y: number): [number, number, number] {
  let ex = x * 2 - 1, ey = y * 2 - 1;
  const ez = 1 - Math.abs(ex) - Math.abs(ey);
  if (ez < 0) {
    const ox = ex;
    ex = (1 - Math.abs(ey)) * (ox >= 0 ? 1 : -1);
    ey = (1 - Math.abs(ox)) * (ey >= 0 ? 1 : -1);
  }
  const l = Math.hypot(ex, ey, ez) || 1;
  return [ex / l, ey / l, ez / l];
}

export async function bakeSurface(
  gl: THREE.WebGLRenderer,
  field: string,
  bounds: { min: readonly number[]; max: readonly number[] },
  width = 512,
  height = 256,
  seed = 7,
): Promise<Candidates> {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag(field),
    glslVersion: THREE.GLSL3,
    uniforms: {
      uMin: { value: new THREE.Vector3(...bounds.min) },
      uMax: { value: new THREE.Vector3(...bounds.max) },
      uPass: { value: 0 },
      uSeed: { value: seed },
    },
  });
  // GLSL3: write gl_FragColor via the compatibility define three adds.
  material.fragmentShader = material.fragmentShader.replace(/gl_FragColor/g, "pc_fragColorOut");
  material.fragmentShader = "layout(location = 0) out highp vec4 pc_fragColorOut;\n" + material.fragmentShader;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prevTarget = gl.getRenderTarget();
  const prevAuto = gl.autoClear;
  const passes: Uint8Array[] = [];
  for (let pass = 0; pass < 3; pass++) {
    material.uniforms.uPass.value = pass;
    gl.setRenderTarget(target);
    gl.autoClear = true;
    gl.render(scene, cam);
    const buf = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, buf);
    passes.push(buf);
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAuto;
    await nextFrame(); // never stall a frame on the bake
  }
  target.dispose();
  material.dispose();
  quad.geometry.dispose();

  const [A, B, C] = passes;
  const n = width * height;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const size = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  const un = (hi: number, lo: number) => (hi * 256 + lo) / 65535;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (B[o + 2] < 128) continue; // invalid
    pos[count * 3] = bounds.min[0] + un(A[o], A[o + 1]) * size[0];
    pos[count * 3 + 1] = bounds.min[1] + un(A[o + 2], A[o + 3]) * size[1];
    pos[count * 3 + 2] = bounds.min[2] + un(B[o], B[o + 1]) * size[2];
    const nn = octDecode(un(C[o], C[o + 1]), un(C[o + 2], C[o + 3]));
    nrm[count * 3] = nn[0];
    nrm[count * 3 + 1] = nn[1];
    nrm[count * 3 + 2] = nn[2];
    count++;
    if ((i & 32767) === 32767) await nextFrame();
  }
  return { pos: pos.subarray(0, count * 3), nrm: nrm.subarray(0, count * 3), count };
}
