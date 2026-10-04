/**
 * Server fetcher registry: one `fetch<Id>(req)` per module. Server-only —
 * imports node:os / node:child_process via the system and music fetchers.
 */
import type { ModuleId } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import { fetchAi } from "./ai";
import { fetchCalendar } from "./calendar";
import { fetchInstagram } from "./instagram";
import { fetchMusic } from "./music";
import { fetchNews } from "./news";
import { fetchProjects } from "./projects";
import { fetchSports } from "./sports";
import { fetchStocks } from "./stocks";
import { fetchSystem } from "./system";
import { fetchWeather } from "./weather";

export const FETCHERS: Record<ModuleId, (req: Request) => Promise<ModulePayload<unknown>>> = {
  instagram: fetchInstagram,
  stocks: fetchStocks,
  projects: fetchProjects,
  sports: fetchSports,
  calendar: fetchCalendar,
  weather: fetchWeather,
  ai: fetchAi,
  news: fetchNews,
  music: fetchMusic,
  system: fetchSystem,
};

/** Provenance label used when a fetcher throws before it can name its source. */
export const SOURCES: Record<ModuleId, string> = {
  instagram: "Instagram Graph API",
  stocks: "Yahoo Finance",
  projects: "GitHub REST API",
  sports: "ESPN site API",
  calendar: "iCal feed",
  weather: "Open-Meteo",
  ai: "Google Gemini",
  news: "Hacker News (Algolia)",
  music: "macOS desktop bridge",
  system: "node:os",
};
