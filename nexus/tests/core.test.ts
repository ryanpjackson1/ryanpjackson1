import { describe, it, expect } from "vitest";
import { GestureClassifier, type GestureEvent } from "@/gesture/classifier";
import type { HandFeatures } from "@/gesture/features";
import { matchCommand, matchTransform } from "@/voice/commands";
import { stepMouth, MOUTH_STEPS } from "@/render/form/mouth";
import { InferredLevel, syllables, PEAK } from "@/voice/level";
import { poissonSelect } from "@/render/form/poisson";
import { stepSpring, SPRING } from "@/core/motion";

const hand = (o: Partial<HandFeatures> = {}): HandFeatures => ({
  x: 0, y: 0, px: 0, py: 0.1, size: 0.2, pinchDist: 0.9, openness: 1,
  extended: [true, true, true, true, true], ...o,
});

function run(frames: (t: number) => HandFeatures | null, seconds: number, fps = 30) {
  const c = new GestureClassifier();
  const out: GestureEvent[] = [];
  for (let i = 0; i <= seconds * fps; i++) out.push(...c.update(i / fps, [frames(i / fps), null]));
  return out.map((e) => e.type);
}

describe("gesture classifier", () => {
  it("detects a swipe left and a swipe right", () => {
    expect(run((t) => hand({ x: 0.6 - t * 3, px: 0.6 - t * 3 }), 0.4)).toContain("swipe-left");
    expect(run((t) => hand({ x: -0.6 + t * 3, px: -0.6 + t * 3 }), 0.4)).toContain("swipe-right");
  });
  it("pinch start / end with hysteresis, and pull while pinched", () => {
    const ev = run((t) => hand({ pinchDist: t < 0.5 ? 0.2 : 0.8, size: t < 0.5 ? 0.2 + t * 0.3 : 0.35, openness: 0.4 }), 1);
    expect(ev).toContain("pinch-start");
    expect(ev).toContain("pull");
    expect(ev).toContain("pinch-end");
  });
  it("push when the pinched hand moves away", () => {
    expect(run((t) => hand({ pinchDist: 0.2, size: 0.2 - t * 0.12, openness: 0.4 }), 0.6)).toContain("push");
  });
  it("palm held still freezes, moving releases", () => {
    const ev = run((t) => hand({ x: t < 1.5 ? 0 : (t - 1.5) * 2 }), 2);
    expect(ev).toContain("palm-hold");
    expect(ev).toContain("palm-release");
  });
  it("closed hand", () => {
    expect(run(() => hand({ openness: 0, extended: [false, false, false, false, false] }), 0.5)).toContain("fist");
  });
  it("circle gesture (reserved for the AI)", () => {
    const ev = run((t) => hand({ openness: 0.4, px: Math.cos(t * 6) * 0.25, py: Math.sin(t * 6) * 0.25, x: 0, y: 0 }), 1.5);
    expect(ev).toContain("circle");
  });
  it("does not see a circle in a straight line", () => {
    expect(run((t) => hand({ openness: 0.4, px: -0.5 + t * 0.6, py: 0 }), 1.5)).not.toContain("circle");
  });
});

describe("command matcher", () => {
  it("matches the transformation phrasings locally", () => {
    expect(matchTransform("Nexus, transform into a human shape")).toBe("human");
    expect(matchTransform("turn yourself into a humanoid")).toBe("human");
    expect(matchTransform("Return to spatial mode")).toBe("spatial");
    expect(matchTransform("go back to the ring")).toBe("spatial");
    expect(matchTransform("what's the weather")).toBeNull();
  });
  it("maps module, rotation, world and stillness commands", () => {
    expect(matchCommand("Open Instagram")).toEqual({ kind: "open-module", id: "instagram" });
    expect(matchCommand("Show Projects")).toEqual({ kind: "open-module", id: "projects" });
    expect(matchCommand("What's my schedule?")).toEqual({ kind: "open-module", id: "calendar" });
    expect(matchCommand("Rotate left")).toEqual({ kind: "rotate", dir: -1 });
    expect(matchCommand("switch to the fog chamber")).toEqual({ kind: "world", id: "fog" });
    expect(matchCommand("hold still")).toEqual({ kind: "drift", on: false });
  });
  it("leaves questions and apps for the model / bridge", () => {
    expect(matchCommand("How is Nvidia today?")).toBeNull();
    expect(matchCommand("Explain MCP")).toBeNull();
    expect(matchCommand("open my reels")).toBeNull();
  });
});

describe("mouth", () => {
  it("is closed in silence and held to five discrete steps", () => {
    const s = { env: 0, open: 0 };
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) { stepMouth(s, Math.abs(Math.sin(i / 6)) * PEAK, 1 / 60); seen.add(s.open); }
    expect(seen.size).toBeLessThanOrEqual(MOUTH_STEPS);
    for (let i = 0; i < 60; i++) stepMouth(s, 0, 1 / 60);
    expect(s.open).toBe(0);
    expect(s.env).toBe(0);
  });
  it("attacks fast and releases slower", () => {
    const a = { env: 0, open: 0 };
    stepMouth(a, 0.6, 0.03);
    const up = a.env;
    const b = { env: 0.6, open: 0 };
    stepMouth(b, 0, 0.03);
    expect(up).toBeGreaterThan(0.6 - b.env);
  });
});

describe("inferred voice level", () => {
  it("counts syllables", () => {
    expect(syllables("understood")).toBe(3);
    expect(syllables("I'm")).toBe(1);
    expect(syllables("moment")).toBe(2);
  });
  it("one pulse per syllable that opens and closes", () => {
    const L = new InferredLevel();
    L.word("hello", 0);
    const samples = Array.from({ length: 100 }, (_, i) => L.level(i / 200));
    expect(Math.max(...samples)).toBeGreaterThan(0.4);
    expect(Math.max(...samples)).toBeLessThanOrEqual(PEAK * 1.2);
    expect(L.level(0.5)).toBe(0);
  });
  it("generic cadence when no boundaries are reported", () => {
    const L = new InferredLevel();
    L.cadence(0);
    const s = Array.from({ length: 200 }, (_, i) => L.level(i / 100));
    expect(s.filter((v) => v > 0.2).length).toBeGreaterThan(40);
    L.stop();
    expect(L.level(3)).toBe(0);
  });
});

describe("poisson selection", () => {
  it("returns an exact count with no clumps", async () => {
    // dense, non-uniform candidates on a unit sphere (clumped at the pole)
    const n = 30000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.pow(Math.random(), 2) * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(a), u, r * Math.sin(a)], i * 3);
    }
    const sel = await poissonSelect(pos, n, 2000, { yieldFn: async () => {} });
    expect(sel.idx.length).toBe(2000);
    let minD = Infinity;
    for (let i = 0; i < 300; i++) for (let j = i + 1; j < 2000; j++) {
      const a = sel.idx[i], b = sel.idx[j];
      minD = Math.min(minD, Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]));
    }
    expect(minD).toBeGreaterThanOrEqual(sel.radius * 0.999);
  });
});

describe("springs", () => {
  it("a spring at rest stays exactly at rest (zero drift)", () => {
    const s = { x: 1.2566370614359172, v: 0 };
    for (let i = 0; i < 1000; i++) stepSpring(s, 1.2566370614359172, SPRING.orbit, 1 / 60);
    expect(s.x).toBe(1.2566370614359172);
    expect(s.v).toBe(0);
  });
  it("the orbit spring overshoots (elasticity) then settles", () => {
    const s = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 600; i++) { stepSpring(s, 1, SPRING.orbit, 1 / 60); max = Math.max(max, s.x); }
    expect(max).toBeGreaterThan(1);
    expect(Math.abs(s.x - 1)).toBeLessThan(1e-3);
  });
});
