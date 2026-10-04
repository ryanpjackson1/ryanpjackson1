/**
 * Module-specific `detail` shapes for ModulePayload.detail.
 *
 * These are produced by the server fetchers in `src/modules/server/*` and
 * read by the expanded panels in `src/modules/panels/*`, the card faces and
 * (for weather) the 3D world. Everything here is plain JSON — no Dates, no
 * class instances — because it crosses the network boundary.
 */
export type { InstagramDetail, InstagramMedia } from "@/core/details";

/* ───────────────────────────── Weather ───────────────────────────── */

/** The six environment states the 3D world knows how to render. */
export type WeatherCondition = "sun" | "clouds" | "rain" | "fog" | "snow" | "storm";

/**
 * Weather detail. The renderer reads `condition` + `intensity` from
 * `payloads.weather.detail` to drive the environment.
 */
export interface WeatherDetail {
  /** Classified environment state (see `classifyCondition`). */
  condition: WeatherCondition;
  /** 0..1 strength of that state (light drizzle 0.2 → downpour 1). */
  intensity: number;
  isDay: boolean;
  location: {
    lat: number;
    lon: number;
    /** Human place name from reverse geocoding, when it resolved. */
    name?: string;
    /** True when coords came from IP geolocation rather than the browser. */
    approximate: boolean;
  };
  /** IANA zone of the location (Open-Meteo `timezone=auto`). */
  timezone: string;
  current: {
    /** ISO local time at the location. */
    time: string;
    temperature: number;
    apparent: number;
    humidity: number;
    /** mm in the last hour. */
    precipitation: number;
    rain: number;
    cloudCover: number;
    windSpeed: number;
    code: number;
    description: string;
  };
  /** Next 24 hours, oldest → newest. `time` is ISO local time at the location. */
  hourly: { time: string; temperature: number; precipProbability: number }[];
  /** Up to 7 days starting today. `date` is YYYY-MM-DD at the location. */
  daily: { date: string; max: number; min: number; code: number; condition: WeatherCondition; description: string }[];
  units: { temperature: string; wind: string; precipitation: string };
}

/* ───────────────────────────── Stocks ───────────────────────────── */

export interface StockQuote {
  symbol: string;
  name: string;
  currency: string;
  exchange?: string;
  price: number;
  prevClose: number;
  dayChange: number;
  dayChangePct: number;
  /** Daily closes for the last month, oldest → newest. */
  closes: { date: string; close: number }[];
  /** Change across the returned month. */
  monthChangePct: number;
  marketTime: number;
  sector: string;
}

export interface Holding extends StockQuote {
  shares: number;
  /** Per-share cost basis from NEXUS_PORTFOLIO. */
  cost: number;
  value: number;
  dayValueChange: number;
  pl: number;
  plPct: number;
  /** 0..1 share of total portfolio value. */
  allocation: number;
}

export interface StocksDetail {
  mode: "portfolio" | "ticker";
  currency: string;
  /** Present in portfolio mode. */
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  totalPl: number;
  totalPlPct: number;
  dayChange: number;
  dayChangePct: number;
  sectors: { sector: string; value: number; weight: number }[];
  /** Sum of shares × close per trading day, oldest → newest. */
  valueSeries: { date: string; value: number }[];
  /** Present in ticker mode (`?symbol=`). */
  ticker?: StockQuote;
  /** Symbols that could not be priced, with the reason. */
  failed: { symbol: string; error: string }[];
}

/* ──────────────────────────── Projects ──────────────────────────── */

export interface ProjectPrompt {
  /** ISO date/time the prompt was used. */
  at: string;
  text: string;
}

export interface Project {
  name: string;
  description: string;
  /** GitHub html_url; empty for local-only projects from nexus.projects.json. */
  url: string;
  homepage?: string;
  language?: string;
  stars: number;
  /** ISO timestamp of the last push (GitHub) — absent for local-only entries. */
  pushedAt?: string;
  topics: string[];
  fork: boolean;
  archived: boolean;
  media: { videos: string[]; images: string[] };
  prompts: ProjectPrompt[];
  /** Pushed within the last 30 days. */
  active: boolean;
}

export interface ProjectsDetail {
  user: string;
  profileUrl: string;
  projects: Project[];
  /** Whether nexus.projects.json was found and parsed. */
  manifest: "loaded" | "missing" | "invalid";
  manifestError?: string;
}

/* ───────────────────────────── Sports ───────────────────────────── */

export type GameState = "pre" | "in" | "post";

export interface GameTeam {
  name: string;
  abbreviation: string;
  logo?: string;
  score?: string;
  winner?: boolean;
  homeAway: "home" | "away";
}

export interface Game {
  id: string;
  league: string;
  name: string;
  /** ISO kick-off time. */
  date: string;
  state: GameState;
  /** ESPN's short status, e.g. "45'+2", "Q3 4:12", "FT", "Sat, Oct 4 3:00 PM". */
  status: string;
  home: GameTeam;
  away: GameTeam;
  venue?: string;
  broadcast?: string;
  url?: string;
}

export interface StandingRow {
  rank: number;
  team: string;
  abbreviation: string;
  logo?: string;
  played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  points?: number;
  /** Pre-formatted secondary stat: goal diff, win %, etc. */
  extra?: string;
  extraLabel?: string;
}

export interface LeagueBoard {
  /** ESPN path, e.g. "soccer/eng.1". */
  path: string;
  name: string;
  abbreviation: string;
  games: Game[];
  standings: { group: string; rows: StandingRow[] }[];
  standingsError?: string;
  error?: string;
}

export interface SportsDetail {
  leagues: LeagueBoard[];
  liveCount: number;
  nextFixture?: Game;
}

/* ──────────────────────────── Calendar ──────────────────────────── */

export interface CalendarEvent {
  /** Stable per-occurrence id (UID + start). */
  id: string;
  summary: string;
  location?: string;
  /** ISO instants. For all-day events these are local midnight boundaries. */
  start: string;
  end: string;
  allDay: boolean;
  /** YYYY-MM-DD for all-day events (timezone-proof display key). */
  date?: string;
  recurring: boolean;
}

export interface CalendarDetail {
  calendarName?: string;
  /** Events overlapping [today 00:00, today + 8 days), sorted by start. */
  events: CalendarEvent[];
  next?: CalendarEvent;
  rangeStart: string;
  rangeEnd: string;
}

/* ────────────────────────────── News ────────────────────────────── */

export interface Article {
  id: string;
  title: string;
  url: string;
  /** Hacker News comment thread, when applicable. */
  discussionUrl?: string;
  /** Domain of `url`, e.g. "nytimes.com". */
  source: string;
  points?: number;
  comments?: number;
  author?: string;
  /** ms epoch the item was published. */
  time: number;
  feed: "front" | "ai" | "rss";
  feedName?: string;
}

export interface NewsDetail {
  front: Article[];
  ai: Article[];
  rss: { name: string; url: string; articles: Article[]; error?: string }[];
}

/* ────────────────────────────── Music ───────────────────────────── */

export interface MusicDetail {
  player: "Spotify" | "Music" | null;
  state: "playing" | "paused" | "stopped";
  track?: string;
  artist?: string;
  album?: string;
  /** Seconds. */
  position?: number;
  /** Seconds. */
  duration?: number;
  artwork?: string;
}

/* ───────────────────────────── System ───────────────────────────── */

export interface SystemDetail {
  host: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    cpuModel: string;
    cores: number;
    uptimeSec: number;
    node: string;
  };
  cpu: {
    /** 0..1 averaged over the ~250ms sample window. */
    usage: number;
    perCore: number[];
    load: [number, number, number];
  };
  memory: { total: number; available: number; used: number; usage: number };
  storage?: { mount: string; total: number; free: number; used: number; usage: number };
  network: { interfaces: number; addresses: number };
  /** Filled in the browser by useModuleFeeds — never by the server. */
  client?: {
    battery?: { level: number; charging: boolean };
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    gpu?: string;
    heap?: { used: number; limit: number };
    fps?: number;
  };
}

/* ─────────────────────────────── AI ─────────────────────────────── */

export interface AiDetail {
  configured: boolean;
  model: string;
  ttsModel?: string;
  voice?: string;
  capabilities: { id: string; label: string; description: string; ready: boolean }[];
}
