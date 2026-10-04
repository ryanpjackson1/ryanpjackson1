/**
 * Launcher row model + builders. Pure (no React) so it can be tested.
 */
import type { BridgeIntent, Intent } from "@/core/intents";
import type { InstagramDetail } from "@/core/details";
import { MODULES, MODULE_IDS } from "@/core/modules";
import { WORLDS, WORLD_IDS } from "@/render/scene/worlds";
import type { BridgeArgs, BridgeVerb, InstalledApp } from "@/bridge/verbs";
import { rank } from "@/bridge/rank";
import { SEARCH, SITES, hostOf, personalDestinations, toUrl } from "@/bridge/sites";

export type RowTag = "APP" | "WEB" | "MY" | "MODULE" | "NEXUS" | "SYS";

export interface Row {
  id: string;
  tag: RowTag;
  title: string;
  subtitle?: string;
  keywords?: string[];
  intent: Intent;
  /** Needs the desktop bridge (shows the "bridge off" reason when it's off). */
  bridge?: boolean;
}

/** Typed per verb: wrong args for a verb is a compile error. */
const bridge = <V extends BridgeVerb>(verb: V, args: BridgeArgs[V]): Intent => ({ kind: "bridge", verb, args }) as BridgeIntent;

export const appRows = (apps: readonly InstalledApp[]): Row[] =>
  apps.map((a) => ({
    id: `app:${a.path}`,
    tag: "APP",
    title: a.name,
    subtitle: a.path,
    intent: { kind: "bridge", verb: "launch", args: { app: a.name } },
    bridge: true,
  }));

export const siteRows = (): Row[] =>
  SITES.map((s) => ({
    id: `web:${s.url}`,
    tag: "WEB",
    title: s.name,
    subtitle: hostOf(s.url),
    keywords: [hostOf(s.url), ...(s.keywords ?? [])],
    intent: { kind: "bridge", verb: "open-url", args: { url: s.url } },
    bridge: true,
  }));

export const personalRows = (ig: InstagramDetail | null | undefined): Row[] =>
  personalDestinations(ig).map((d) => ({
    id: `my:${d.key}`,
    tag: "MY",
    title: d.label,
    subtitle: hostOf(d.url),
    keywords: ["instagram", "my", d.key === "reel" ? "reels" : d.key === "post" ? "posts" : "profile"],
    intent: { kind: "bridge", verb: "open-url", args: { url: d.url } },
    bridge: true,
  }));

export const moduleRows = (): Row[] =>
  MODULE_IDS.map((id) => ({
    id: `module:${id}`,
    tag: "MODULE",
    title: MODULES[id].label,
    subtitle: MODULES[id].code,
    keywords: MODULES[id].aliases,
    intent: { kind: "open-module", id },
  }));

export const nexusRows = (): Row[] => [
  { id: "nx:rotate-left", tag: "NEXUS", title: "Rotate left", keywords: ["previous", "ring"], intent: { kind: "rotate", dir: -1 } },
  { id: "nx:rotate-right", tag: "NEXUS", title: "Rotate right", keywords: ["next", "ring"], intent: { kind: "rotate", dir: 1 } },
  ...WORLD_IDS.map((id): Row => ({
    id: `nx:world:${id}`,
    tag: "NEXUS",
    title: `World · ${WORLDS[id].name}`,
    keywords: [WORLDS[id].name, id, "world", "environment"],
    intent: { kind: "world", id },
  })),
  { id: "nx:drift", tag: "NEXUS", title: "Toggle drift", keywords: ["ambient", "motion"], intent: { kind: "drift" } },
  { id: "nx:hud", tag: "NEXUS", title: "Toggle HUD", keywords: ["hide hud", "show hud", "interface"], intent: { kind: "hud" } },
  { id: "nx:human", tag: "NEXUS", title: "Transform into human shape", keywords: ["human", "figure", "embody"], intent: { kind: "transform", to: "human" } },
  { id: "nx:spatial", tag: "NEXUS", title: "Return to spatial mode", keywords: ["spatial", "ring"], intent: { kind: "transform", to: "spatial" } },
];

export const sysRows = (): Row[] => [
  { id: "sys:lock", tag: "SYS", title: "Lock screen", keywords: ["lock"], intent: bridge("lock", {}), bridge: true },
  { id: "sys:sleep", tag: "SYS", title: "Sleep display", keywords: ["screen off", "display off"], intent: bridge("sleep-display", {}), bridge: true },
  { id: "sys:shot", tag: "SYS", title: "Take screenshot", keywords: ["screenshot", "capture"], intent: bridge("screenshot", {}), bridge: true },
  { id: "sys:dnd-on", tag: "SYS", title: "Do Not Disturb on", keywords: ["dnd", "focus"], intent: bridge("dnd", { on: true }), bridge: true },
  { id: "sys:dnd-off", tag: "SYS", title: "Do Not Disturb off", keywords: ["dnd", "focus"], intent: bridge("dnd", { on: false }), bridge: true },
  { id: "sys:play", tag: "SYS", title: "Play / pause", keywords: ["music", "media", "pause", "play"], intent: bridge("media", { action: "toggle" }), bridge: true },
  { id: "sys:next", tag: "SYS", title: "Next track", keywords: ["skip", "music"], intent: bridge("media", { action: "next" }), bridge: true },
  { id: "sys:prev", tag: "SYS", title: "Previous track", keywords: ["back", "music"], intent: bridge("media", { action: "previous" }), bridge: true },
  { id: "sys:vol-up", tag: "SYS", title: "Volume up", keywords: ["louder", "sound"], intent: bridge("volume", { delta: 10 }), bridge: true },
  { id: "sys:vol-down", tag: "SYS", title: "Volume down", keywords: ["quieter", "sound"], intent: bridge("volume", { delta: -10 }), bridge: true },
  { id: "sys:mute", tag: "SYS", title: "Mute", keywords: ["sound off", "silence"], intent: bridge("volume", { mute: true }), bridge: true },
  { id: "sys:hide", tag: "SYS", title: "Hide other apps", keywords: ["hide others", "focus"], intent: bridge("hide-others", {}), bridge: true },
  { id: "sys:clip", tag: "SYS", title: "Read clipboard", keywords: ["paste", "clipboard"], intent: bridge("clipboard-read", {}), bridge: true },
];

const MAX_ROWS = 60;

/** The one combined, ranked list the palette shows for `query`. */
export function buildResults(query: string, all: readonly Row[]): Row[] {
  const q = query.trim();
  if (!q) return all.filter((r) => r.tag !== "APP" && r.tag !== "WEB").slice(0, MAX_ROWS);

  const ranked = rank(q, all, (r) => [r.title, ...(r.keywords ?? [])]).map((r) => r.item);
  const out: Row[] = [];
  const url = toUrl(q);
  if (url) {
    out.push({ id: `url:${url}`, tag: "WEB", title: `Open ${hostOf(url)}`, subtitle: url, intent: { kind: "bridge", verb: "open-url", args: { url } }, bridge: true });
  }
  out.push(...ranked);
  if (!url && q.length > 1) {
    out.push({ id: `search:${q}`, tag: "WEB", title: `Search Google for “${q}”`, intent: { kind: "bridge", verb: "open-url", args: { url: SEARCH.google(q) } }, bridge: true });
  }
  return out.slice(0, MAX_ROWS);
}
