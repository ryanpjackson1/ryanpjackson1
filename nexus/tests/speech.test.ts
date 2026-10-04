import { describe, it, expect, vi } from "vitest";
vi.mock("@/audio/engine", () => ({ audioCtx: () => null, voiceBus: () => null, voiceLevel: () => 0, initAudio: () => null }));
vi.mock("@/stores/nexus", () => ({ useNexus: { getState: () => ({ set: () => {}, voice: "idle", awake: false }) } }));
const { SentenceSplitter } = await import("@/voice/speech");

describe("sentence splitter (speech begins before the response completes)", () => {
  it("emits each sentence as soon as it completes", () => {
    const s = new SentenceSplitter();
    const out: string[] = [];
    for (const tok of ["Nvidia is ", "up 2.4% today", ". It led the ", "semis rally! Volume", " was heavy."]) s.push(tok, (x) => out.push(x));
    expect(out).toEqual(["Nvidia is up 2.4% today.", "It led the semis rally!"]);
    s.flush((x) => out.push(x));
    expect(out[2]).toBe("Volume was heavy.");
  });
});
