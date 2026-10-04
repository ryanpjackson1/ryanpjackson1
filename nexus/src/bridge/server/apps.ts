/**
 * Live scan of installed applications + spoken-name resolution.
 *
 * Launch/quit never pass the user's words to anything: the words are matched
 * against the scanned list and only the *scanned* path/name is used. A string
 * that isn't plausibly an app name (shell syntax, garbage) resolves to null.
 */
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InstalledApp } from "../verbs";
import { MatchTier, normalize, rank } from "../rank";

export const APP_DIRS = [
  "/Applications",
  "/Applications/Utilities",
  "/System/Applications",
  "/System/Applications/Utilities",
  path.join(os.homedir(), "Applications"),
];

const CACHE_MS = 30_000;
let cache: { at: number; apps: InstalledApp[] } | null = null;
let inflight: Promise<InstalledApp[]> | null = null;

async function appsIn(dir: string, depth: number): Promise<InstalledApp[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InstalledApp[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.name.endsWith(".app")) {
      out.push({ name: e.name.slice(0, -4), path: full });
    } else if (depth > 0 && e.isDirectory() && !(dir === "/Applications" && e.name === "Utilities")) {
      // Vendor folders: /Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app
      out.push(...(await appsIn(full, depth - 1)));
    }
  }
  return out;
}

async function scan(): Promise<InstalledApp[]> {
  const seen = new Set<string>();
  const out: InstalledApp[] = [];
  for (const dir of APP_DIRS) {
    for (const app of await appsIn(dir, 1)) {
      const key = app.name.toLowerCase();
      if (seen.has(key)) continue; // first directory wins (/Applications over /System)
      seen.add(key);
      out.push(app);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Installed apps, cached for ~30s. */
export async function listApps(force = false): Promise<InstalledApp[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.apps;
  inflight ??= scan().then((apps) => {
    cache = { at: Date.now(), apps };
    inflight = null;
    return apps;
  }, (err) => {
    inflight = null;
    throw err;
  });
  return inflight;
}

/** Spoken name → canonical app name, for names people never say in full. */
const ALIASES: Record<string, string> = {
  "vs code": "Visual Studio Code",
  vscode: "Visual Studio Code",
  code: "Visual Studio Code",
  chrome: "Google Chrome",
  settings: "System Settings",
  "system preferences": "System Settings",
  preferences: "System Settings",
  word: "Microsoft Word",
  excel: "Microsoft Excel",
  powerpoint: "Microsoft PowerPoint",
  outlook: "Microsoft Outlook",
  teams: "Microsoft Teams",
  "app store": "App Store",
  itunes: "Music",
};

/**
 * Characters that never appear in a spoken app name but are the bread and
 * butter of shell/script injection. Their presence alone disqualifies input.
 * (Defense in depth: even a match could only ever yield a scanned path.)
 */
const SUSPICIOUS = /[;|`$<>\\"{}\n\r\0]|&&|\|\|/;

/** Normalise a spoken name: lowercase, drop ".app", punctuation, extra spaces. */
export const normalizeAppName = (s: string) => normalize(s.trim().replace(/\.app$/i, ""));

/**
 * Pure resolver — unit-testable anywhere. Exact name, then alias, then the
 * launcher ranking restricted to strong tiers (prefix / initials / word
 * boundary; never bare substring) with a minimum query length.
 */
export function resolveAgainst(spoken: string, apps: readonly InstalledApp[]): InstalledApp | null {
  if (typeof spoken !== "string" || spoken.length > 80 || SUSPICIOUS.test(spoken)) return null;
  const q = normalizeAppName(spoken);
  if (q.length < 2) return null;

  const exact = apps.find((a) => normalizeAppName(a.name) === q);
  if (exact) return exact;

  const alias = ALIASES[q];
  if (alias) {
    const hit = apps.find((a) => a.name === alias);
    if (hit) return hit;
  }

  const ranked = rank(q, apps, (a) => a.name).filter((r) => {
    if (r.tier === MatchTier.Substring) return false;
    if (r.tier === MatchTier.Initials) return q.length >= 2;
    return q.length >= 3;
  });
  return ranked[0]?.item ?? null;
}

/** Resolve against the live scan. */
export async function resolveApp(spoken: string): Promise<InstalledApp | null> {
  return resolveAgainst(spoken, await listApps());
}
