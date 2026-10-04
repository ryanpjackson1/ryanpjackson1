/**
 * News — Hacker News front page + AI-related stories via the Algolia HN API
 * (no key), plus optional RSS/Atom feeds from NEXUS_NEWS_RSS (comma list).
 */
import { emptyPayload, type ModulePayload } from "@/core/payload";
import type { Article, NewsDetail } from "@/modules/types";
import { errorMessage, getJSON, getText, NEXUS_UA, truncate } from "./http";

const SOURCE = "Hacker News (Algolia)";
const FRONT_URL = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30";
const AI_URL =
  "https://hn.algolia.com/api/v1/search_by_date?query=AI%20OR%20LLM%20OR%20OpenAI%20OR%20Anthropic%20OR%20Gemini&tags=story&numericFilters=points%3E40&hitsPerPage=20";

interface HnHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  author?: string;
  created_at_i: number;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fromHit(h: HnHit, feed: Article["feed"]): Article | null {
  const title = h.title ?? h.story_title;
  if (!title) return null;
  const discussionUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
  const url = h.url || discussionUrl;
  return {
    id: `hn-${h.objectID}`,
    title,
    url,
    discussionUrl,
    source: h.url ? domainOf(h.url) : "news.ycombinator.com",
    points: h.points,
    comments: h.num_comments,
    author: h.author,
    time: h.created_at_i * 1000,
    feed,
  };
}

/* ─────────────────────── minimal RSS / Atom ─────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tagText(block: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return undefined;
  const inner = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
}

/** Parse RSS 2.0 `<item>`s or Atom `<entry>`s into articles. Pure. */
export function parseFeed(xml: string, feedUrl: string): { title?: string; articles: Article[] } {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const channelTitle = tagText(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ""), "title");
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const articles: Article[] = [];
  blocks.forEach((b, i) => {
    const title = tagText(b, "title");
    let link: string | undefined;
    if (isAtom) {
      const alt = /<link[^>]*rel=["']alternate["'][^>]*>/i.exec(b)?.[0] ?? /<link[^>]*>/i.exec(b)?.[0];
      link = alt ? /href=["']([^"']+)["']/i.exec(alt)?.[1] : undefined;
    } else {
      link = tagText(b, "link") || tagText(b, "guid");
    }
    if (!title || !link) return;
    const dateText = tagText(b, isAtom ? "published" : "pubDate") ?? tagText(b, "updated") ?? tagText(b, "dc:date");
    const time = dateText ? Date.parse(dateText) : NaN;
    const url = decodeEntities(link);
    articles.push({
      id: `rss-${domainOf(feedUrl)}-${i}-${url}`,
      title,
      url,
      source: domainOf(url) || domainOf(feedUrl),
      time: Number.isFinite(time) ? time : 0,
      feed: "rss",
      feedName: channelTitle,
    });
  });
  return { title: channelTitle, articles };
}

export async function fetchNews(_req: Request): Promise<ModulePayload<NewsDetail>> {
  const feeds = (process.env.NEXUS_NEWS_RSS ?? "").split(",").map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));

  const [frontRes, aiRes, ...rssRes] = await Promise.allSettled([
    getJSON<{ hits: HnHit[] }>(FRONT_URL, { timeoutMs: 7000, revalidate: 120 }),
    getJSON<{ hits: HnHit[] }>(AI_URL, { timeoutMs: 7000, revalidate: 300 }),
    ...feeds.map((u) => getText(u, { timeoutMs: 7000, revalidate: 600, headers: { "user-agent": NEXUS_UA } })),
  ]);

  const front = frontRes.status === "fulfilled"
    ? frontRes.value.hits.map((h) => fromHit(h, "front")).filter((a): a is Article => !!a).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    : [];
  const ai = aiRes.status === "fulfilled" ? aiRes.value.hits.map((h) => fromHit(h, "ai")).filter((a): a is Article => !!a) : [];
  const rss: NewsDetail["rss"] = feeds.map((url, i) => {
    const r = rssRes[i];
    if (r.status === "rejected") return { name: domainOf(url), url, articles: [], error: errorMessage(r.reason) };
    const parsed = parseFeed(r.value, url);
    return { name: parsed.title ?? domainOf(url), url, articles: parsed.articles.slice(0, 20) };
  });

  if (front.length === 0 && ai.length === 0 && rss.every((f) => f.articles.length === 0)) {
    const why = frontRes.status === "rejected" ? errorMessage(frontRes.reason) : "no stories returned";
    return emptyPayload("news", "error", SOURCE, `${why}. Check that hn.algolia.com is reachable from the server.`) as ModulePayload<NewsDetail>;
  }

  const lead = front[0] ?? ai[0] ?? rss.find((f) => f.articles.length)?.articles[0];
  const top3 = (front.length ? front : ai).slice(0, 3).map((a) => a.title);
  const source = [SOURCE, ...rss.filter((f) => !f.error).map((f) => f.name)].join(" · ");
  const failedFeeds = rss.filter((f) => f.error);

  return {
    id: "news",
    status: "live",
    fetchedAt: Date.now(),
    source,
    headline: { label: lead?.source ? `Top · ${lead.source}` : "Top story", value: lead ? truncate(lead.title, 64) : "—" },
    metrics: [
      { label: "Front page", value: String(front.length) },
      { label: "AI stories", value: String(ai.length) },
      { label: "Top points", value: front[0]?.points !== undefined ? String(front[0].points) : "—" },
      ...(feeds.length ? [{ label: "RSS feeds", value: `${feeds.length - failedFeeds.length}/${feeds.length}`, warn: failedFeeds.length > 0 }] : []),
    ],
    series: front.slice(0, 20).map((a) => a.points ?? 0),
    summary: top3.length ? `Top stories: ${top3.map((t) => `"${t}"`).join("; ")}.` : "No Hacker News stories available right now.",
    detail: { front, ai, rss },
  };
}
