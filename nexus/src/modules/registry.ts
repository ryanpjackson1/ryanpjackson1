/**
 * The ten modules on the ring. Order is ring order. Accent hues stay in the
 * blue/cyan/violet family so the room reads as restrained holographic light.
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
  /** Short code printed on the card. */
  code: string;
  /** Accent hue in degrees. */
  hue: number;
  /** Extra words the launcher search matches. */
  keywords: string[];
  /** One line describing what the module will do once connected. */
  purpose: string;
}

export const MODULES: Record<ModuleId, ModuleMeta> = {
  instagram: { id: "instagram", label: "Instagram", code: "IG-01", hue: 262, keywords: ["social", "followers", "reels", "insta"], purpose: "Audience, reach and content performance." },
  stocks: { id: "stocks", label: "Stocks", code: "MK-02", hue: 252, keywords: ["portfolio", "market", "shares", "finance"], purpose: "Portfolio value, movers and allocation." },
  projects: { id: "projects", label: "Projects", code: "PR-03", hue: 242, keywords: ["work", "repos", "github", "code"], purpose: "Active work, milestones and repositories." },
  sports: { id: "sports", label: "Sports", code: "SP-04", hue: 232, keywords: ["scores", "fixtures", "football", "league"], purpose: "Scores, fixtures and standings." },
  calendar: { id: "calendar", label: "Calendar", code: "CL-05", hue: 222, keywords: ["schedule", "agenda", "meetings", "events"], purpose: "Today's schedule and the week ahead." },
  weather: { id: "weather", label: "Weather", code: "WX-06", hue: 212, keywords: ["forecast", "temperature", "rain"], purpose: "Current conditions and forecast." },
  ai: { id: "ai", label: "AI", code: "AI-07", hue: 204, keywords: ["assistant", "chat", "model"], purpose: "Assistant — not implemented in this milestone." },
  news: { id: "news", label: "News", code: "NW-08", hue: 196, keywords: ["headlines", "articles"], purpose: "Headlines and summaries." },
  music: { id: "music", label: "Music", code: "MU-09", hue: 190, keywords: ["audio", "playing", "song"], purpose: "Now playing and recent listening." },
  system: { id: "system", label: "System", code: "SY-10", hue: 184, keywords: ["diagnostics", "performance", "status"], purpose: "Renderer, quality tier and input status." },
};

export const MODULE_COUNT = MODULE_IDS.length;
export const moduleIndex = (id: ModuleId) => MODULE_IDS.indexOf(id);
export const isModuleId = (v: unknown): v is ModuleId =>
  typeof v === "string" && (MODULE_IDS as readonly string[]).includes(v);

export const accent = (id: ModuleId, alpha = 1) => `hsla(${MODULES[id].hue}, 80%, 68%, ${alpha})`;
