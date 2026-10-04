import { describe, it, expect } from "vitest";
import { searchLauncher, matchRank, MatchRank, LAUNCHER_ENTRIES } from "@/commands/launcher";
import { GestureClassifier } from "@/input/gestures/classifier";
import { extractFeatures, type HandFeatures } from "@/input/gestures/features";
import { describeCameraError, cameraPreflight } from "@/input/gestures/cameraErrors";
import { stepSpring, springFor, SPRING } from "@/motion/spring";
import { pixelRatio, probeWebGL, initialTier } from "@/render/quality";
import { validateAICommand } from "@/ai/validate";
import { DEMO, DEMO_SOURCE } from "@/modules/demo";
import { MODULE_IDS } from "@/modules/registry";

describe("launcher search", () => {
  it("lists all ten modules", () => {
    expect(LAUNCHER_ENTRIES.filter((e) => e.group === "Module")).toHaveLength(10);
  });
  it("ranks prefix over word-prefix over substring", () => {
    expect(matchRank("sto", { title: "Stocks", keywords: [] })).toBe(MatchRank.Prefix);
    expect(matchRank("left", { title: "Rotate left", keywords: [] })).toBe(MatchRank.WordPrefix);
    expect(matchRank("ock", { title: "Stocks", keywords: [] })).toBe(MatchRank.Substring);
    expect(searchLauncher("s")[0].title).toBe("Stocks");
  });
  it("matches keywords and fuzzy subsequences", () => {
    expect(searchLauncher("portfolio")[0].title).toBe("Stocks");
    expect(searchLauncher("cldr")[0].title).toBe("Calendar");
    expect(searchLauncher("webcam")[0].command).toEqual({ type: "tracking/start" });
    expect(searchLauncher("zzzz")).toHaveLength(0);
  });
});

const hand = (o: Partial<HandFeatures>): HandFeatures => ({ x: 0, y: 0, px: 0, py: 0, pinch: 0.9, ...o });
function feed(fn: (t: number) => HandFeatures | null, seconds: number) {
  const c = new GestureClassifier();
  const out: string[] = [];
  for (let i = 0; i <= seconds * 30; i++) out.push(...c.update(i / 30, fn(i / 30)).map((e) => e.type));
  return out;
}

describe("gestures", () => {
  it("swipe left and right", () => {
    expect(feed((t) => hand({ x: 0.5 - t * 3 }), 0.4)).toEqual(["swipe-left"]);
    expect(feed((t) => hand({ x: -0.5 + t * 3 }), 0.4)).toEqual(["swipe-right"]);
  });
  it("slow or vertical motion is not a swipe", () => {
    expect(feed((t) => hand({ x: t * 0.3 }), 2)).toEqual([]);
    expect(feed((t) => hand({ y: t * 3, x: t * 1 }), 0.4)).toEqual([]);
  });
  it("one pinch event per pinch (hysteresis)", () => {
    const ev = feed((t) => hand({ pinch: t < 0.5 ? 0.2 : t < 1 ? 0.4 : t < 1.5 ? 0.8 : 0.2 }), 2);
    expect(ev).toEqual(["pinch", "pinch"]);
  });
  it("a lost hand resets state", () => {
    expect(feed((t) => (t < 0.2 ? hand({ pinch: 0.2 }) : null), 0.5)).toEqual(["pinch"]);
  });
  it("extracts mirrored NDC features from landmarks", () => {
    const lm = Array.from({ length: 21 }, () => ({ x: 0.25, y: 0.5 }));
    lm[9] = { x: 0.25, y: 0.3 };
    lm[4] = { x: 0.25, y: 0.5 };
    lm[8] = { x: 0.25, y: 0.5 };
    const f = extractFeatures(lm)!;
    expect(f.px).toBeCloseTo(0.5);
    expect(f.pinch).toBe(0);
    expect(extractFeatures([])).toBeNull();
  });
});

describe("camera errors are explained", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "no-camera"],
    ["NotReadableError", "in-use"],
    ["SecurityError", "insecure"],
    ["WeirdError", "error"],
  ])("%s → %s with a fix", (name, status) => {
    const s = describeCameraError({ name, message: "x" });
    expect(s.status).toBe(status);
    expect(s.hint && s.hint.length).toBeGreaterThan(10);
  });
  it("model failures say how to recover", () => {
    expect(describeCameraError(new Error("fetch failed"), "model").hint).toMatch(/fetch-model/);
  });
  it("preflight catches insecure contexts and missing APIs", () => {
    expect(cameraPreflight({ isSecureContext: false, hasMediaDevices: true, hasWasm: true })?.status).toBe("insecure");
    expect(cameraPreflight({ isSecureContext: true, hasMediaDevices: false, hasWasm: true })?.status).toBe("unsupported");
    expect(cameraPreflight({ isSecureContext: true, hasMediaDevices: true, hasWasm: true })).toBeNull();
  });
});

describe("springs", () => {
  it("a spring at rest stays exactly at rest (locked scene is still)", () => {
    const s = { x: 1.2566370614359172, v: 0 };
    for (let i = 0; i < 600; i++) stepSpring(s, 1.2566370614359172, SPRING.orbit, 1 / 60);
    expect(s).toEqual({ x: 1.2566370614359172, v: 0 });
  });
  it("a released card returns exactly to its slot", () => {
    const s = { x: 0.8, v: 2 };
    for (let i = 0; i < 600; i++) stepSpring(s, 0, SPRING.settle, 1 / 60);
    expect(s).toEqual({ x: 0, v: 0 });
  });
  it("orbit overshoots normally but never with reduced motion", () => {
    const peak = (rm: boolean) => {
      const s = { x: 0, v: 0 };
      let max = 0;
      for (let i = 0; i < 600; i++) { stepSpring(s, 1, springFor("orbit", rm), 1 / 60); max = Math.max(max, s.x); }
      return max;
    };
    expect(peak(false)).toBeGreaterThan(1);
    expect(peak(true)).toBeLessThanOrEqual(1);
  });
});

describe("rendering quality", () => {
  it("caps the pixel ratio per tier", () => {
    expect(pixelRatio(2, 3)).toBe(1.5);
    expect(pixelRatio(0, 2)).toBe(1);
    expect(pixelRatio(2, 1)).toBe(1);
  });
  it("chooses a conservative starting tier", () => {
    expect(initialTier({ cores: 4, memoryGB: 8, minSide: 1000 })).toBe(0);
    expect(initialTier({ cores: 12, memoryGB: 16, minSide: 1000 })).toBe(2);
  });
  it("?renderer=2d forces the fallback", () => {
    const fakeDoc = { createElement: () => { throw new Error("should not probe"); } } as unknown as Document;
    expect(probeWebGL(fakeDoc, "?renderer=2d").ok).toBe(false);
  });
  it("reports missing WebGL", () => {
    const fakeDoc = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(probeWebGL(fakeDoc, "")).toMatchObject({ ok: false });
  });
});

describe("AI boundary (no AI implemented)", () => {
  it("accepts well-formed, allow-listed commands", () => {
    expect(validateAICommand({ type: "module/open", id: "news" })).toEqual({ type: "module/open", id: "news" });
    expect(validateAICommand({ type: "ring/rotate", steps: -2 })).toEqual({ type: "ring/rotate", steps: -2 });
  });
  it("rejects camera, unknown, malformed and over-specified commands", () => {
    expect(validateAICommand({ type: "tracking/start" })).toBeNull();
    expect(validateAICommand({ type: "renderer/set", renderer: "fallback" })).toBeNull();
    expect(validateAICommand({ type: "module/open", id: "bank" })).toBeNull();
    expect(validateAICommand({ type: "ring/rotate", steps: 1.5 })).toBeNull();
    expect(validateAICommand({ type: "ring/rotate", steps: 1, extra: true })).toBeNull();
    expect(validateAICommand("module/open")).toBeNull();
    expect(validateAICommand(null)).toBeNull();
  });
});

describe("demo data is labelled", () => {
  it("every module's data is flagged demo with the not-connected source line", () => {
    for (const id of MODULE_IDS) {
      expect(DEMO[id].demo).toBe(true);
      expect(DEMO[id].source).toBe(DEMO_SOURCE);
    }
    expect(DEMO_SOURCE).toMatch(/not connected/i);
  });
});
