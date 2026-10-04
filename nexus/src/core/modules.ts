/**
 * Module registry — the single source of truth for what lives on the ring.
 * Accent hues span violet → blue → cyan so a module is recognisable in
 * peripheral vision mid-rotation (Phase 6). Hues are in degrees; nothing
 * here sits near warning orange (~25°) or centre gold (~43°).
 */
export const MODULE_IDS = [
  "instagram",
  "stocks",
  "projects",
  "sports",
  "calendar",
  "weather",
  "ai",
  "news",
  "music",
  "system",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  /** Short code drawn on the card face, Teenage-Engineering style. */
  code: string;
  /** Accent hue in degrees (violet 268 → cyan 186). */
  hue: number;
  /** Words the command engine accepts for this module. */
  aliases: string[];
}

export const MODULES: Record<ModuleId, ModuleMeta> = {
  instagram: { id: "instagram", label: "Instagram", code: "IG-01", hue: 268, aliases: ["instagram", "insta", "ig", "reels", "followers"] },
  stocks:    { id: "stocks",    label: "Stocks",    code: "MK-02", hue: 258, aliases: ["stocks", "stock", "portfolio", "market", "markets", "shares"] },
  projects:  { id: "projects",  label: "Projects",  code: "PR-03", hue: 248, aliases: ["projects", "project", "work", "repos", "github"] },
  sports:    { id: "sports",    label: "Sports",    code: "SP-04", hue: 238, aliases: ["sports", "sport", "scores", "football", "soccer", "nba", "fixtures"] },
  calendar:  { id: "calendar",  label: "Calendar",  code: "CL-05", hue: 228, aliases: ["calendar", "schedule", "agenda", "meetings", "events"] },
  weather:   { id: "weather",   label: "Weather",   code: "WX-06", hue: 218, aliases: ["weather", "forecast", "temperature", "rain"] },
  ai:        { id: "ai",        label: "AI",        code: "AI-07", hue: 208, aliases: ["ai", "assistant", "intelligence", "knowledge"] },
  news:      { id: "news",      label: "News",      code: "NW-08", hue: 200, aliases: ["news", "headlines", "articles"] },
  music:     { id: "music",     label: "Music",     code: "MU-09", hue: 193, aliases: ["music", "spotify", "song", "playing", "audio"] },
  system:    { id: "system",    label: "System",    code: "SY-10", hue: 186, aliases: ["system", "diagnostics", "cpu", "memory", "battery", "status"] },
};

export const moduleIndex = (id: ModuleId) => MODULE_IDS.indexOf(id);

/** hsl → linear-ish rgb triple in 0..1 (sRGB; good enough for UI + shaders). */
export function hueToRgb(h: number, s = 0.78, l = 0.62): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

export const accentCss = (id: ModuleId, alpha = 1) =>
  `hsla(${MODULES[id].hue}, 82%, 66%, ${alpha})`;

/** Signal colours. Warning orange and centre gold are ~18° apart — never mix. */
export const WARNING_HUE = 25;
export const GOLD_HUE = 43;
