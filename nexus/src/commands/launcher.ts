import { MODULES, MODULE_IDS } from "@/modules/registry";
import type { Command } from "./types";

/**
 * Ctrl+K launcher entries. Modules and actions live in ONE list; every
 * entry carries the Command it dispatches, so the launcher is just another
 * input source for the command layer.
 */
export interface LauncherEntry {
  id: string;
  title: string;
  subtitle: string;
  group: "Module" | "Action";
  keywords: string[];
  command: Command;
}

export const LAUNCHER_ENTRIES: LauncherEntry[] = [
  ...MODULE_IDS.map((id): LauncherEntry => ({
    id: `module:${id}`,
    title: MODULES[id].label,
    subtitle: `${MODULES[id].code} · ${MODULES[id].purpose}`,
    group: "Module",
    keywords: MODULES[id].keywords,
    command: { type: "module/open", id },
  })),
  { id: "act:left", title: "Rotate left", subtitle: "← arrow", group: "Action", keywords: ["previous", "ring"], command: { type: "ring/rotate", steps: -1 } },
  { id: "act:right", title: "Rotate right", subtitle: "→ arrow", group: "Action", keywords: ["next", "ring"], command: { type: "ring/rotate", steps: 1 } },
  { id: "act:drift", title: "Toggle locked / drift", subtitle: "L · ambient motion is off by default", group: "Action", keywords: ["motion", "lock", "float", "ambient"], command: { type: "motion/drift" } },
  { id: "act:reduced", title: "Toggle reduced motion", subtitle: "Removes springs' overshoot and all drift", group: "Action", keywords: ["accessibility", "animation", "motion"], command: { type: "motion/reduced" } },
  { id: "act:camera", title: "Enable webcam hand tracking", subtitle: "Asks for camera permission", group: "Action", keywords: ["gesture", "mediapipe", "hand", "camera", "webcam"], command: { type: "tracking/start" } },
  { id: "act:camera-off", title: "Turn off webcam tracking", subtitle: "Releases the camera", group: "Action", keywords: ["gesture", "camera", "stop"], command: { type: "tracking/stop" } },
];

export const MatchRank = { Exact: 0, Prefix: 1, WordPrefix: 2, Substring: 3, Keyword: 4, Fuzzy: 5 } as const;
export type MatchRank = (typeof MatchRank)[keyof typeof MatchRank];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

/** Rank one entry against a query, or null when it doesn't match. */
export function matchRank(query: string, e: Pick<LauncherEntry, "title" | "keywords">): MatchRank | null {
  const q = norm(query);
  if (!q) return MatchRank.Exact;
  const t = norm(e.title);
  if (t === q) return MatchRank.Exact;
  if (t.startsWith(q)) return MatchRank.Prefix;
  if (t.split(" ").some((w) => w.startsWith(q))) return MatchRank.WordPrefix;
  if (t.includes(q)) return MatchRank.Substring;
  if (e.keywords.some((k) => norm(k).startsWith(q))) return MatchRank.Keyword;
  // fuzzy: every query character appears in order in the title
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length && q.length >= 2 ? MatchRank.Fuzzy : null;
}

export function searchLauncher(query: string, entries: LauncherEntry[] = LAUNCHER_ENTRIES): LauncherEntry[] {
  return entries
    .map((e, order) => ({ e, order, r: matchRank(query, e) }))
    .filter((x): x is { e: LauncherEntry; order: number; r: MatchRank } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.order - b.order)
    .map((x) => x.e);
}
