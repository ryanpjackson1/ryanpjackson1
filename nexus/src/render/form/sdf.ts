/**
 * Signed-distance fields for the figure (Phase 7).
 *
 * The bust is authored at human scale (metres) with broad, heavily blended
 * forms and NOTHING that sticks out: no ears, no carved lip line, no brow
 * primitive. Every crease collects surface points and reads as a bulge or
 * a bright arc, so there are none. The brief is a synthetic intelligence,
 * not a likeness.
 *
 * The hand is authored as DATA (below); both its distance field and the
 * vertex-shader pose code are emitted from that data, so every knuckle is
 * a hinge the shader can rotate about.
 */

export const SDF_LIB = /* glsl */ `
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
// capsule whose radius tapers from ra (at a) to rb (at b)
float sdTaper(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
`;

/* ───────────────────────────── BUST ───────────────────────────── */

export const BUST_BOUNDS = { min: [-0.29, -0.45, -0.15], max: [0.29, 0.26, 0.16] } as const;
/** Bottom of the bust; the flat cap below this is never sampled. */
export const BUST_CUT_Y = -0.43;

/** Landmarks the shader and rig use. Keep in sync with the field. */
export const BUST = {
  eyes: [[-0.031, 0.113, 0.083], [0.031, 0.113, 0.083]] as [number, number, number][],
  mouthY: 0.061,
  mouthZ: 0.083,
  /** Jaw hinge: a line through the ears (x axis) at this point. */
  jawPivot: [0, 0.1, -0.006] as [number, number, number],
  /** Head turns rigidly about the top of the neck. */
  neckPivot: [0, -0.04, -0.012] as [number, number, number],
  crownY: 0.235,
};

export const BUST_GLSL = /* glsl */ `
float sdFigure(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // cranium
  float d = sdEllipsoid(p - vec3(0.0, 0.138, -0.014), vec3(0.082, 0.097, 0.099));
  // face mass, set forward and lower
  d = smin(d, sdEllipsoid(p - vec3(0.0, 0.082, 0.020), vec3(0.067, 0.078, 0.076)), 0.034);
  // jaw + chin, one broad form
  d = smin(d, sdEllipsoid(p - vec3(0.0, 0.034, 0.030), vec3(0.054, 0.040, 0.056)), 0.034);
  // nose: a very soft ridge, blended so wide it reads as a plane change
  d = smin(d, sdEllipsoid(p - vec3(0.0, 0.098, 0.088), vec3(0.012, 0.026, 0.016)), 0.022);
  // cheek planes
  d = smin(d, sdEllipsoid(q - vec3(0.038, 0.090, 0.050), vec3(0.030, 0.026, 0.028)), 0.03);
  // neck
  d = smin(d, sdCapsule(p, vec3(0.0, 0.035, -0.018), vec3(0.0, -0.14, -0.012), 0.050), 0.042);
  // trapezius → shoulders
  d = smin(d, sdTaper(q, vec3(0.0, -0.150, -0.020), vec3(0.168, -0.205, -0.022), 0.062, 0.058), 0.06);
  // deltoids
  d = smin(d, sdEllipsoid(q - vec3(0.192, -0.240, -0.012), vec3(0.060, 0.072, 0.064)), 0.05);
  // upper chest
  d = smin(d, sdEllipsoid(p - vec3(0.0, -0.315, 0.000), vec3(0.192, 0.150, 0.104)), 0.07);
  // chest fullness
  d = smin(d, sdEllipsoid(q - vec3(0.074, -0.292, 0.044), vec3(0.084, 0.068, 0.058)), 0.05);
  // flat cut at the bottom
  d = max(d, -(p.y + 0.44));
  return d;
}
`;

/* ───────────────────────────── HAND ─────────────────────────────
 * Local frame (metres): origin at the wrist crease, +y toward the
 * fingertips, +z out of the palm (palm normal), +x toward the thumb
 * (a right hand seen palm-up).
 */
export type V3 = [number, number, number];

export interface FingerSpec {
  name: string;
  /** Knuckle (MCP) position. */
  base: V3;
  /** Rest direction of the finger (normalised in code). */
  dir: V3;
  /** Phalanx lengths, proximal → distal. */
  segs: number[];
  /** Radii at each joint and at the tip (segs.length + 1). */
  radii: number[];
  /** Curl angle per joint at curl = 1 (radians). */
  curl: number[];
  /** Hinge axis override (default: dir × palmNormal). */
  axis?: V3;
}

export const HAND_DATA: { palm: { a: V3; b: V3; r: number }[]; fingers: FingerSpec[]; forearm: { a: V3; b: V3; ra: number; rb: number } } = {
  palm: [
    { a: [0.022, 0.014, 0.0], b: [0.026, 0.074, 0.0], r: 0.019 },   // index metacarpal
    { a: [0.004, 0.016, 0.0], b: [0.006, 0.078, 0.0], r: 0.02 },    // middle
    { a: [-0.014, 0.016, 0.0], b: [-0.014, 0.074, 0.0], r: 0.019 }, // ring
    { a: [-0.028, 0.016, 0.0], b: [-0.032, 0.066, 0.0], r: 0.017 }, // little
    { a: [0.026, 0.012, 0.006], b: [0.046, 0.032, 0.01], r: 0.019 }, // thenar
  ],
  fingers: [
    { name: "index",  base: [0.027, 0.080, 0.0],  dir: [0.10, 1, 0],  segs: [0.043, 0.026, 0.021], radii: [0.0102, 0.0094, 0.0085, 0.0074], curl: [0.95, 1.2, 0.8] },
    { name: "middle", base: [0.007, 0.084, 0.0],  dir: [0.02, 1, 0],  segs: [0.047, 0.029, 0.023], radii: [0.0105, 0.0097, 0.0087, 0.0076], curl: [0.95, 1.2, 0.8] },
    { name: "ring",   base: [-0.014, 0.080, 0.0], dir: [-0.07, 1, 0], segs: [0.044, 0.027, 0.022], radii: [0.0098, 0.0091, 0.0082, 0.0071], curl: [0.95, 1.2, 0.8] },
    { name: "little", base: [-0.033, 0.071, 0.0], dir: [-0.16, 1, 0], segs: [0.034, 0.021, 0.019], radii: [0.0088, 0.0081, 0.0074, 0.0064], curl: [0.95, 1.15, 0.8] },
    { name: "thumb",  base: [0.050, 0.036, 0.012], dir: [0.85, 0.75, 0.25], segs: [0.036, 0.030, 0.026], radii: [0.0135, 0.0118, 0.0102, 0.0088], curl: [0.35, 0.55, 0.6], axis: [-0.35, 0.45, 0.82] },
  ],
  forearm: { a: [0.0, 0.0, -0.004], b: [0.0, -0.42, -0.02], ra: 0.031, rb: 0.042 },
};

export const HAND_BOUNDS = { min: [-0.07, -0.44, -0.06], max: [0.13, 0.2, 0.06] } as const;
/** Hand points below this (in local y) belong to the forearm. Cut far below the frame. */
export const HAND_CUT_Y = -0.42;

const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const f = (n: number) => n.toFixed(5);
const v = (a: V3) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;

/** Rest-pose joint positions of a finger: [MCP, PIP, DIP, tip]. */
export function fingerJoints(fs: FingerSpec): V3[] {
  const d = norm(fs.dir);
  const out: V3[] = [fs.base];
  let p = fs.base;
  for (const s of fs.segs) { p = add(p, d, s); out.push(p); }
  return out;
}

export function fingerAxis(fs: FingerSpec): V3 {
  return norm(fs.axis ?? cross(norm(fs.dir), [0, 0, 1]));
}

/** Bone id encoding: 0 = palm/forearm (rigid), 1 + finger*3 + segment. */
export const boneId = (finger: number, seg: number) => 1 + finger * 3 + seg;

/** Emit the hand's distance field from the data. */
export function handFieldGLSL(): string {
  const lines: string[] = [];
  const { palm, fingers, forearm } = HAND_DATA;
  lines.push(`float d = sdTaper(p, ${v(forearm.a)}, ${v(forearm.b)}, ${f(forearm.ra)}, ${f(forearm.rb)});`);
  // broad palm slab blended from the metacarpals
  lines.push(`d = smin(d, sdEllipsoid(p - vec3(0.0, 0.045, 0.0), vec3(0.046, 0.05, 0.016)), 0.02);`);
  palm.forEach((c) => lines.push(`d = smin(d, sdCapsule(p, ${v(c.a)}, ${v(c.b)}, ${f(c.r)}), 0.016);`));
  fingers.forEach((fs) => {
    const j = fingerJoints(fs);
    for (let s = 0; s < fs.segs.length; s++) {
      lines.push(`d = smin(d, sdTaper(p, ${v(j[s])}, ${v(j[s + 1])}, ${f(fs.radii[s])}, ${f(fs.radii[s + 1])}), ${s === 0 ? "0.012" : "0.004"});`);
    }
  });
  lines.push(`d = max(d, -(p.y - ${f(HAND_CUT_Y)}));`);
  return `float sdFigure(vec3 p) {\n  ${lines.join("\n  ")}\n  return d;\n}\n`;
}

/**
 * Emit the pose code from the same data: for a point on finger f, segment
 * s, apply the hinge rotations of joints s … 0 (distal first) about their
 * REST pivots. Rigid rotations about hinges cannot tear the surface.
 */
export function handPoseGLSL(): string {
  const out: string[] = [];
  out.push(`vec3 nxRotAxis(vec3 p, vec3 o, vec3 k, float a) {
  vec3 v = p - o; float c = cos(a), s = sin(a);
  return o + v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}`);
  out.push(`vec3 nxRotDir(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }`);
  out.push(`void poseHand(inout vec3 p, inout vec3 n, float bone, float curl, float thumbCurl) {`);
  out.push(`  int b = int(bone + 0.5);`);
  out.push(`  if (b == 0) return;`);
  HAND_DATA.fingers.forEach((fs, fi) => {
    const j = fingerJoints(fs);
    const ax = fingerAxis(fs);
    const c = fi === 4 ? "thumbCurl" : "curl";
    for (let s = 0; s < fs.segs.length; s++) {
      const id = boneId(fi, s);
      const steps: string[] = [];
      for (let k = s; k >= 0; k--) {
        const ang = `${c} * ${f(fs.curl[k])}`;
        steps.push(`p = nxRotAxis(p, ${v(j[k])}, ${v(ax)}, ${ang}); n = nxRotDir(n, ${v(ax)}, ${ang});`);
      }
      out.push(`  if (b == ${id}) { ${steps.join(" ")} return; }`);
    }
  });
  out.push(`}`);
  return out.join("\n");
}

/** CPU bone assignment: nearest finger segment within reach, else rigid palm. */
export function assignBone(p: V3): number {
  let best = 0;
  let bestD = Infinity;
  HAND_DATA.fingers.forEach((fs, fi) => {
    const j = fingerJoints(fs);
    for (let s = 0; s < fs.segs.length; s++) {
      const a = j[s], b = j[s + 1];
      const ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const pa: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const t0 = (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2);
      // points just behind the knuckle stay with the palm
      if (s === 0 && t0 < -0.05) continue;
      const t = Math.max(0, Math.min(1, t0));
      const d = Math.hypot(pa[0] - ba[0] * t, pa[1] - ba[1] * t, pa[2] - ba[2] * t) - (fs.radii[s] + (fs.radii[s + 1] - fs.radii[s]) * t);
      if (d < bestD) { bestD = d; best = boneId(fi, s); }
    }
  });
  return bestD < 0.006 ? best : 0;
}
