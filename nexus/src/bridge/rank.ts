/**
 * Pure fuzzy ranking shared by the ⌘K launcher and the server-side app
 * resolver. No DOM, no Node — safe to import anywhere and unit-test on Linux.
 *
 * Tiers, best first:
 *   Exact        "safari"   → "Safari"
 *   Prefix       "saf"      → "Safari"
 *   Initials     "vsc"      → "Visual Studio Code"
 *   WordBoundary "studio"   → "Visual Studio Code"
 *   Substring    "fari"     → "Safari"
 * Ties within a tier break on the shorter name, then alphabetically.
 * Anything that matches none of the tiers is excluded.
 */
export const MatchTier = {
  Exact: 0,
  Prefix: 1,
  Initials: 2,
  WordBoundary: 3,
  Substring: 4,
} as const;

export type MatchTier = (typeof MatchTier)[keyof typeof MatchTier];

export interface Ranked<T> {
  item: T;
  tier: MatchTier;
  /** The name (of possibly several) that produced the best tier. */
  name: string;
}

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Words of a display name, splitting camelCase ("FaceTime" → face, time). */
export function words(name: string): string[] {
  return normalize(name.replace(/([a-z])([A-Z])/g, "$1 $2")).split(" ").filter(Boolean);
}

export const initialsOf = (name: string) => words(name).map((w) => w[0]).join("");

/** Best tier at which `query` matches `name`, or null for no match. */
export function matchTier(query: string, name: string): MatchTier | null {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return null;
  if (q === n) return MatchTier.Exact;
  if (n.startsWith(q)) return MatchTier.Prefix;
  // Initials need at least two letters and no spaces ("vsc", not "v").
  if (q.length >= 2 && !q.includes(" ") && initialsOf(name).startsWith(q)) return MatchTier.Initials;
  const ws = words(name);
  for (let i = 1; i < ws.length; i++) {
    if (ws.slice(i).join(" ").startsWith(q)) return MatchTier.WordBoundary;
  }
  if (n.includes(q)) return MatchTier.Substring;
  return null;
}

/**
 * Rank `items` against `query`. `getName` may return several names (title +
 * keywords); the best-matching one counts.
 */
export function rank<T>(
  query: string,
  items: readonly T[],
  getName: (item: T) => string | readonly string[],
): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const raw = getName(item);
    const names = typeof raw === "string" ? [raw] : raw;
    let best: Ranked<T> | null = null;
    for (const name of names) {
      const tier = matchTier(query, name);
      if (tier === null) continue;
      if (!best || tier < best.tier) best = { item, tier, name };
    }
    if (best) out.push(best);
  }
  return out.sort(compareRanked);
}

export function compareRanked<T>(a: Ranked<T>, b: Ranked<T>): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.name.localeCompare(b.name);
}
