/**
 * Websites NEXUS knows by name, search URL builders, and personal
 * destinations derived from the LIVE Instagram feed. Pure, client-safe.
 */
import type { InstagramDetail, InstagramMedia } from "@/core/details";

export interface Site {
  name: string;
  url: string;
  /** Extra spoken names. */
  keywords?: string[];
}

export const SITES: readonly Site[] = [
  { name: "YouTube", url: "https://www.youtube.com" },
  { name: "Google", url: "https://www.google.com" },
  { name: "Gmail", url: "https://mail.google.com", keywords: ["mail", "email"] },
  { name: "Google Drive", url: "https://drive.google.com", keywords: ["drive"] },
  { name: "Google Docs", url: "https://docs.google.com", keywords: ["docs"] },
  { name: "Google Maps", url: "https://maps.google.com", keywords: ["maps"] },
  { name: "GitHub", url: "https://github.com" },
  { name: "Instagram", url: "https://www.instagram.com" },
  { name: "X", url: "https://x.com", keywords: ["twitter"] },
  { name: "Reddit", url: "https://www.reddit.com" },
  { name: "LinkedIn", url: "https://www.linkedin.com" },
  { name: "Facebook", url: "https://www.facebook.com" },
  { name: "TikTok", url: "https://www.tiktok.com" },
  { name: "Netflix", url: "https://www.netflix.com" },
  { name: "Amazon", url: "https://www.amazon.com" },
  { name: "Wikipedia", url: "https://en.wikipedia.org", keywords: ["wiki"] },
  { name: "Hacker News", url: "https://news.ycombinator.com", keywords: ["hn"] },
  { name: "Stack Overflow", url: "https://stackoverflow.com" },
  { name: "ChatGPT", url: "https://chatgpt.com" },
  { name: "Claude", url: "https://claude.ai" },
  { name: "Figma", url: "https://www.figma.com" },
  { name: "Notion", url: "https://www.notion.so" },
  { name: "Vercel", url: "https://vercel.com" },
  { name: "Twitch", url: "https://www.twitch.tv" },
  { name: "Spotify Web", url: "https://open.spotify.com" },
  { name: "Apple", url: "https://www.apple.com" },
];

export const SEARCH = {
  youtube: (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  google: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
} as const;

const DOMAIN = /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#]\S*)?$/i;

/** "github.com", "https://x.com/foo", "news.ycombinator.com" → true. */
export const looksLikeUrl = (s: string) => DOMAIN.test(s.trim()) && !/\s/.test(s.trim());

/** Normalise a domain-ish string to an https URL, or null. */
export function toUrl(s: string): string | null {
  const t = s.trim().replace(/[.,!?]+$/, "");
  if (!looksLikeUrl(t)) return null;
  const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function findSite(spoken: string): Site | null {
  const q = spoken.trim().toLowerCase();
  return SITES.find((s) => s.name.toLowerCase() === q || s.keywords?.includes(q)) ?? null;
}

// ---- personal destinations -------------------------------------------------

const newestFirst = (a: InstagramMedia, b: InstagramMedia) => Date.parse(b.timestamp) - Date.parse(a.timestamp);

export const isReel = (m: InstagramMedia) =>
  (m.productType ?? "").toUpperCase() === "REELS" || m.mediaType === "REELS";

/** Newest reel; falls back to the newest VIDEO when the feed omits product_type. */
export function latestReel(d: InstagramDetail): InstagramMedia | null {
  const sorted = [...d.media].sort(newestFirst);
  return sorted.find(isReel) ?? sorted.find((m) => m.mediaType === "VIDEO" && !m.productType) ?? null;
}

export const latestPost = (d: InstagramDetail): InstagramMedia | null => [...d.media].sort(newestFirst)[0] ?? null;

export interface PersonalDestination {
  key: "profile" | "reel" | "post";
  label: string;
  url: string;
}

/** Everything personal we can link to right now — all from the live feed. */
export function personalDestinations(d: InstagramDetail | undefined | null): PersonalDestination[] {
  if (!d) return [];
  const out: PersonalDestination[] = [];
  if (d.profileUrl) out.push({ key: "profile", label: `My profile · @${d.username}`, url: d.profileUrl });
  const reel = latestReel(d);
  if (reel?.permalink) out.push({ key: "reel", label: "My latest reel", url: reel.permalink });
  const post = latestPost(d);
  if (post?.permalink) out.push({ key: "post", label: "My latest post", url: post.permalink });
  return out;
}
