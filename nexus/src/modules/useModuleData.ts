"use client";
/**
 * Live module feeds. Mount `useModuleFeeds()` ONCE at the app root: it polls
 * every /api/modules/<id> route on its own cadence, pauses while the tab is
 * hidden, and writes results into the store via `setPayload`.
 *
 * Also exported for anywhere in the app:
 *  - refreshModule(id)  fetch one module now (deduped) and commit it
 *  - fetchTicker(sym)   single-ticker quote ("How is Nvidia today?"), NOT committed
 */
import { useEffect } from "react";
import { MODULE_IDS, MODULES, type ModuleId } from "@/core/modules";
import { emptyPayload, type Metric, type ModulePayload } from "@/core/payload";
import { log, useNexus } from "@/stores/nexus";
import type { SportsDetail, StocksDetail, SystemDetail } from "./types";

/* ─────────────────────────── cadence ─────────────────────────── */

const SEC = 1000;
const MIN = 60 * SEC;

/** Poll interval per module (ms). Sports switches to SPORTS_LIVE while games are in progress. */
export const POLL_INTERVALS: Record<ModuleId, number> = {
  stocks: 30 * SEC,
  sports: 5 * MIN,
  music: 3 * SEC,
  system: 2 * SEC,
  weather: 10 * MIN,
  news: 5 * MIN,
  calendar: 5 * MIN,
  instagram: 15 * MIN,
  projects: 15 * MIN,
  ai: 60 * MIN,
};
const SPORTS_LIVE = 30 * SEC;
/** Spacing of the first fetches so ten requests don't land in one frame. */
const INITIAL_STAGGER = 90;
const CLIENT_TIMEOUT = 25 * SEC;

function intervalFor(id: ModuleId): number {
  if (id === "sports") {
    const d = useNexus.getState().payloads.sports?.detail as SportsDetail | undefined;
    if (d && d.liveCount > 0) return SPORTS_LIVE;
  }
  return POLL_INTERVALS[id];
}

/* ─────────────────────────── weather location ─────────────────────────── */

type Coords = { lat: number; lon: number } | "ip";
const COORDS_KEY = "nexus.coords";
let coordsPromise: Promise<Coords> | null = null;

function readCachedCoords(): { lat: number; lon: number } | null {
  try {
    const raw = sessionStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { lat: unknown; lon: unknown };
    return typeof c.lat === "number" && typeof c.lon === "number" ? { lat: c.lat, lon: c.lon } : null;
  } catch {
    return null;
  }
}

/** Browser geolocation once per session; "ip" means fall back to server-side IP lookup. */
function resolveCoords(): Promise<Coords> {
  if (coordsPromise) return coordsPromise;
  coordsPromise = new Promise<Coords>((resolve) => {
    const cached = readCachedCoords();
    if (cached) return resolve(cached);
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve("ip");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        try {
          sessionStorage.setItem(COORDS_KEY, JSON.stringify(c));
        } catch {
          /* storage blocked — fine, we just ask again next session */
        }
        resolve(c);
      },
      (err) => {
        log(`WEATHER location ${err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"} · using IP estimate`, "warn");
        resolve("ip");
      },
      { enableHighAccuracy: false, timeout: 10 * SEC, maximumAge: 30 * MIN },
    );
  });
  return coordsPromise;
}

/* ─────────────────────────── system (browser half) ─────────────────────────── */

interface BatteryLike { level: number; charging: boolean }
interface ConnectionLike { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
let battery: BatteryLike | null = null;
let batteryRequested = false;

function requestBattery() {
  if (batteryRequested || typeof navigator === "undefined") return;
  batteryRequested = true;
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  nav.getBattery?.().then((b) => { battery = b; }).catch(() => { battery = null; });
}

function clientSystem(): NonNullable<SystemDetail["client"]> {
  requestBattery();
  const s = useNexus.getState();
  const conn = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return {
    battery: battery ? { level: battery.level, charging: battery.charging } : undefined,
    connection: conn ? { effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt, saveData: conn.saveData } : undefined,
    gpu: s.gpu && s.gpu !== "—" ? s.gpu : undefined,
    heap: mem ? { used: mem.usedJSHeapSize, limit: mem.jsHeapSizeLimit } : undefined,
    fps: s.fps,
  };
}

/** Merge browser diagnostics into the server's system payload and recompute warning state. */
function augmentSystem(p: ModulePayload): ModulePayload {
  if (p.status !== "live" && p.status !== "stale") return p;
  const d = p.detail as SystemDetail | undefined;
  if (!d) return p;
  const client = clientSystem();
  const lowBattery = !!client.battery && client.battery.level < 0.15 && !client.battery.charging;
  const memWarn = d.memory.usage > 0.92;
  const cpuWarn = d.cpu.usage > 0.9;
  const find = (label: string) => p.metrics.find((m) => m.label === label);

  const metrics: Metric[] = [
    find("Memory"),
    find("Storage"),
    client.battery
      ? { label: "Battery", value: `${Math.round(client.battery.level * 100)}%${client.battery.charging ? " ⚡" : ""}`, warn: lowBattery }
      : undefined,
    client.connection?.effectiveType
      ? { label: "Network", value: `${client.connection.effectiveType.toUpperCase()}${client.connection.downlink ? ` · ${client.connection.downlink} Mb/s` : ""}` }
      : undefined,
    { label: "FPS", value: String(Math.round(client.fps ?? 0)) },
    find("Load 1m"),
  ].filter((m): m is Metric => !!m).slice(0, 6);

  let summary = p.summary;
  if (client.battery) summary += ` Battery ${Math.round(client.battery.level * 100)}%${client.battery.charging ? " and charging" : ""}.`;
  if (client.gpu) summary += ` GPU: ${client.gpu}.`;

  return { ...p, metrics, summary, warning: memWarn || cpuWarn || lowBattery, detail: { ...d, client } };
}

/* ─────────────────────────── fetching ─────────────────────────── */

const inflight = new Map<ModuleId, Promise<ModulePayload>>();
const lastState = new Map<ModuleId, string>();

async function request(id: ModuleId, query = ""): Promise<ModulePayload> {
  const path = `/api/modules/${id}${query}`;
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(CLIENT_TIMEOUT) });
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError";
    return {
      ...emptyPayload(id, "error", "NEXUS server", timeout
        ? `${path} took longer than ${CLIENT_TIMEOUT / SEC}s — the upstream service may be slow; NEXUS will retry.`
        : "Could not reach the NEXUS server — make sure `npm run dev` (or `npm start`) is still running."),
      // Tag so commit() can keep the last good data instead.
      source: "transport",
    };
  }
  try {
    const body = (await res.json()) as ModulePayload | { error?: string };
    if (!res.ok || !("id" in body)) {
      const msg = "error" in body && body.error ? body.error : `HTTP ${res.status}`;
      return emptyPayload(id, "error", "NEXUS server", `${path} failed (${msg}) — check the dev server log.`);
    }
    return body;
  } catch {
    return emptyPayload(id, "error", "NEXUS server", `${path} returned HTTP ${res.status} without JSON — check the dev server log.`);
  }
}

function commit(p: ModulePayload) {
  const store = useNexus.getState();
  const prev = store.payloads[p.id];
  // A transport hiccup shouldn't wipe good data: keep it, marked stale.
  if (p.source === "transport") {
    if (prev && (prev.status === "live" || prev.status === "stale")) p = { ...prev, status: "stale" };
    else p = { ...p, source: "NEXUS server" };
  }
  store.setPayload(p);

  const label = MODULES[p.id].label.toUpperCase();
  const key = `${p.status}|${p.warning ? "warn" : ""}`;
  if (lastState.get(p.id) !== key) {
    lastState.set(p.id, key);
    const level = p.warning || p.status === "error" || p.status === "unconfigured" ? "warn" : p.status === "live" ? "ok" : "info";
    log(`${label} ${p.status}${p.warning ? " · WARNING" : ""} · ${p.source}`, level);
  }
}

/** Fetch one module now (deduplicated while in flight) and commit it to the store. */
export function refreshModule(id: ModuleId): Promise<ModulePayload> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const run = (async () => {
    let query = "";
    if (id === "weather") {
      const c = await resolveCoords();
      query = c === "ip" ? "?ip=1" : `?lat=${c.lat.toFixed(3)}&lon=${c.lon.toFixed(3)}`;
    }
    let p = await request(id, query);
    if (id === "system") p = augmentSystem(p);
    commit(p);
    return useNexus.getState().payloads[id] ?? p;
  })().finally(() => inflight.delete(id));
  inflight.set(id, run);
  return run;
}

/** Quote one ticker without touching the portfolio payload. */
export function fetchTicker(symbol: string): Promise<ModulePayload<StocksDetail>> {
  return request("stocks", `?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}`) as Promise<ModulePayload<StocksDetail>>;
}

/* ─────────────────────────── scheduler ─────────────────────────── */

/** Poll every module route on its cadence. Mount once, at app level. */
export function useModuleFeeds(): void {
  useEffect(() => {
    let disposed = false;
    const timers = new Map<ModuleId, number>();
    const lastRun = new Map<ModuleId, number>();

    const clear = (id: ModuleId) => {
      const t = timers.get(id);
      if (t !== undefined) window.clearTimeout(t);
      timers.delete(id);
    };
    const schedule = (id: ModuleId, delay: number) => {
      clear(id);
      timers.set(id, window.setTimeout(() => void tick(id), Math.max(0, delay)));
    };
    const tick = async (id: ModuleId) => {
      timers.delete(id);
      if (disposed || document.hidden) return; // resumed by visibilitychange
      lastRun.set(id, Date.now());
      try {
        await refreshModule(id);
      } finally {
        if (!disposed && !document.hidden) schedule(id, intervalFor(id));
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        MODULE_IDS.forEach(clear);
        return;
      }
      // Back in view: refresh whatever fell due while hidden, keep the rest on cadence.
      const now = Date.now();
      MODULE_IDS.forEach((id, i) => {
        const due = (lastRun.get(id) ?? 0) + intervalFor(id) - now;
        schedule(id, due <= 0 ? i * INITIAL_STAGGER : due);
      });
    };

    MODULE_IDS.forEach((id, i) => schedule(id, i * INITIAL_STAGGER));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      MODULE_IDS.forEach(clear);
    };
  }, []);
}
