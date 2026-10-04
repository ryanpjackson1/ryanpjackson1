/**
 * Environments (Phase 4) and their film grades (Phase 6).
 * A grade splits the ends of the blue luminance ramp: violet into the
 * shadows, warm white into the highlights; mid-tones are left alone and
 * contrast pivots at 18% grey.
 */
export type WorldId = "studio" | "lab" | "observatory" | "industrial" | "ocean" | "fog";

export interface Grade {
  /** Shadow tint (linear rgb) — violet family. */
  shadow: [number, number, number];
  /** Highlight tint (linear rgb) — warm white family. */
  highlight: [number, number, number];
  /** 0..1 strength of the split. */
  split: number;
  /** Filmic contrast around the 0.18 pivot. <1 flattens. */
  contrast: number;
  /** Global warmth: +warm / −cool (Open Water runs negative). */
  warmth: number;
  /** Halation: red-orange bleed around highlights. */
  halation: number;
  /** Highlight bleed radius multiplier (Fog Chamber maxes it). */
  bleed: number;
  /** Saturation multiplier. */
  saturation: number;
}

export interface World {
  id: WorldId;
  name: string;
  fog: string;
  fogDensity: number;
  key: string;       // key light colour
  fill: string;
  beams: number;     // light shaft count
  beamColor: string;
  dust: number;      // dust density multiplier
  floor: "lattice" | "grid" | "glass" | "deck" | "water" | "none";
  grade: Grade;
}

export const WORLDS: Record<WorldId, World> = {
  studio: {
    id: "studio", name: "Minimal Studio",
    fog: "#05070c", fogDensity: 0.045, key: "#cfe3ff", fill: "#3a5bff", beams: 3, beamColor: "#9cc3ff", dust: 1, floor: "lattice",
    grade: { shadow: [0.32, 0.18, 0.62], highlight: [1.0, 0.94, 0.84], split: 0.42, contrast: 1.08, warmth: 0.02, halation: 0.18, bleed: 1.0, saturation: 1.0 },
  },
  lab: {
    id: "lab", name: "Dark Lab",
    fog: "#020306", fogDensity: 0.06, key: "#a9c8ff", fill: "#1d2f8a", beams: 2, beamColor: "#6f9cff", dust: 0.7, floor: "grid",
    grade: { shadow: [0.26, 0.12, 0.58], highlight: [0.96, 0.95, 1.0], split: 0.5, contrast: 1.18, warmth: -0.02, halation: 0.12, bleed: 0.8, saturation: 0.92 },
  },
  observatory: {
    id: "observatory", name: "Glass Observatory",
    fog: "#070b14", fogDensity: 0.03, key: "#e6f0ff", fill: "#6b8cff", beams: 5, beamColor: "#d6e6ff", dust: 1.3, floor: "glass",
    grade: { shadow: [0.36, 0.24, 0.66], highlight: [1.0, 0.96, 0.9], split: 0.36, contrast: 1.04, warmth: 0.03, halation: 0.22, bleed: 1.2, saturation: 1.05 },
  },
  industrial: {
    id: "industrial", name: "Industrial Deck",
    fog: "#0d0906", fogDensity: 0.05, key: "#ffd9a8", fill: "#8a5f34", beams: 4, beamColor: "#ffc580", dust: 1.6, floor: "deck",
    // Sodium-warm and hard.
    grade: { shadow: [0.3, 0.16, 0.48], highlight: [1.0, 0.82, 0.58], split: 0.55, contrast: 1.26, warmth: 0.16, halation: 0.3, bleed: 0.9, saturation: 0.95 },
  },
  ocean: {
    id: "ocean", name: "Open Water",
    fog: "#03101a", fogDensity: 0.035, key: "#bfe6ff", fill: "#1f6fb0", beams: 3, beamColor: "#8fd4ff", dust: 0.6, floor: "water",
    // Negative warmth: blue hour.
    grade: { shadow: [0.22, 0.2, 0.6], highlight: [0.9, 0.96, 1.0], split: 0.4, contrast: 1.06, warmth: -0.14, halation: 0.1, bleed: 1.1, saturation: 1.08 },
  },
  fog: {
    id: "fog", name: "Fog Chamber",
    fog: "#0b0e16", fogDensity: 0.11, key: "#dfe8ff", fill: "#5060c0", beams: 6, beamColor: "#c4d4ff", dust: 2.2, floor: "none",
    // Maximum bleed, sub-1.0 contrast.
    grade: { shadow: [0.34, 0.24, 0.6], highlight: [1.0, 0.95, 0.9], split: 0.3, contrast: 0.86, warmth: 0.0, halation: 0.34, bleed: 2.0, saturation: 0.82 },
  },
};

export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
