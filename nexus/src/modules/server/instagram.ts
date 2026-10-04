/**
 * Instagram — profile, recent media, per-media insights and account insights
 * from the Instagram Graph API. Fills `InstagramDetail` (src/core/details.ts).
 *
 * Two login products issue different tokens and live on different hosts:
 *   IGAA…  Instagram API with Instagram Login → graph.instagram.com, account "me"
 *   EAA…   Instagram API with Facebook Login  → graph.facebook.com, account = INSTAGRAM_BUSINESS_ID
 */
import { emptyPayload, type ModulePayload, type Metric } from "@/core/payload";
import type { InstagramDetail, InstagramMedia } from "@/core/details";
import { compact, errorMessage, getJSON, UpstreamError } from "./http";

const SOURCE = "Instagram Graph API v23.0";
const GRAPH_VERSION = "v23.0";

export interface InstagramApiPath {
  path: InstagramDetail["apiPath"];
  base: string;
  /** "me" for Instagram Login; null when the account id must be supplied. */
  account: "me" | null;
  needsBusinessId: boolean;
}

/**
 * Detect which Graph API product a token belongs to from its prefix.
 * Pure. Returns null for anything that is neither an IGAA nor an EAA token.
 */
export function detectInstagramToken(token: string | undefined | null): InstagramApiPath | null {
  const t = (token ?? "").trim();
  if (t.startsWith("IGAA")) {
    return { path: "instagram-login", base: `https://graph.instagram.com/${GRAPH_VERSION}`, account: "me", needsBusinessId: false };
  }
  if (t.startsWith("EAA")) {
    return { path: "facebook-login", base: `https://graph.facebook.com/${GRAPH_VERSION}`, account: null, needsBusinessId: true };
  }
  return null;
}

/**
 * Reconstruct running follower totals from daily deltas.
 *
 * Instagram's `follower_count` insight is NOT a running total: each value is
 * the net change INTO that day (followers gained on day i). Given today's
 * true total we walk backwards:
 *
 *   total[last] = currentTotal
 *   total[i-1]  = total[i] − delta[i]
 *
 * e.g. current 1000, deltas [+5, +3, −2, +10] → totals [989, 992, 990, 1000]
 * (989 already includes day 0's +5; the day before the window was 984).
 *
 * Pure. Input is assumed oldest → newest; output keeps the same dates.
 */
export function backAccumulate(
  currentTotal: number,
  deltas: { date: string; value: number }[],
): { date: string; total: number }[] {
  const out: { date: string; total: number }[] = new Array(deltas.length);
  let total = currentTotal;
  for (let i = deltas.length - 1; i >= 0; i--) {
    out[i] = { date: deltas[i].date, total };
    total -= Number.isFinite(deltas[i].value) ? deltas[i].value : 0;
  }
  return out;
}

/* ─────────────────────────── API shapes ─────────────────────────── */

interface IgProfile {
  id?: string;
  user_id?: string;
  username: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
}

interface IgMediaRaw {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface IgInsightValue { value: number | Record<string, number>; end_time?: string }
interface IgInsight {
  name: string;
  period: string;
  values?: IgInsightValue[];
  total_value?: { value: number };
}

/* ─────────────────────────── helpers ─────────────────────────── */

function graphUrl(base: string, path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  return `${base}/${path}?${qs}`;
}

/** Map Graph API failures to the exact remedy. */
function hintFor(e: unknown, apiPath: InstagramApiPath): string {
  if (e instanceof UpstreamError) {
    const body = e.body as { error?: { code?: number; error_subcode?: number; message?: string } } | undefined;
    const code = body?.error?.code;
    if (code === 190 || e.status === 401) {
      return apiPath.path === "instagram-login"
        ? "INSTAGRAM_TOKEN was rejected (expired or revoked). Generate a new long-lived token in Meta for Developers → your app → Instagram → API setup with Instagram login → Generate token, and paste it into INSTAGRAM_TOKEN in .env.local."
        : "INSTAGRAM_TOKEN was rejected (expired or revoked). Create a new long-lived user token in Graph API Explorer with instagram_basic, instagram_manage_insights and pages_show_list, then paste it into INSTAGRAM_TOKEN in .env.local.";
    }
    if (code === 100 && apiPath.path === "facebook-login") {
      return `Instagram rejected the request (${e.message}). Check INSTAGRAM_BUSINESS_ID is the Instagram business account id (not the Facebook Page id): GET https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=instagram_business_account{id,username} with your token.`;
    }
    if (code === 10 || code === 200) {
      return `Instagram denied a permission (${e.message}). Re-issue INSTAGRAM_TOKEN with instagram_business_basic + instagram_business_manage_insights (Instagram Login) or instagram_basic + instagram_manage_insights (Facebook Login).`;
    }
    if (code === 4 || code === 17 || code === 32 || code === 613) {
      return "Instagram API rate limit reached — NEXUS will retry on the next poll (15 min).";
    }
  }
  return `${errorMessage(e)}. Check INSTAGRAM_TOKEN in .env.local and that graph.instagram.com / graph.facebook.com are reachable.`;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Per-media reach + plays/views; Instagram rejects metrics per media type, so tolerate failures. */
async function mediaInsights(base: string, id: string, token: string): Promise<{ reach?: number; plays?: number }> {
  for (const metric of ["reach,views", "reach"]) {
    try {
      const res = await getJSON<{ data: IgInsight[] }>(graphUrl(base, `${id}/insights`, { metric }, token), {
        timeoutMs: 6000,
        revalidate: 900,
      });
      const out: { reach?: number; plays?: number } = {};
      for (const m of res.data ?? []) {
        const v = m.values?.[0]?.value ?? m.total_value?.value;
        if (typeof v !== "number") continue;
        if (m.name === "reach") out.reach = v;
        if (m.name === "views" || m.name === "plays") out.plays = v;
      }
      return out;
    } catch {
      /* try the narrower metric set */
    }
  }
  return {};
}

/** Account reach over 28 days — newer API versions only accept total_value. */
async function accountReach(base: string, account: string, token: string): Promise<number | undefined> {
  const now = Math.floor(Date.now() / 1000);
  const attempts: Record<string, string>[] = [
    { metric: "reach", period: "day", metric_type: "total_value", since: String(now - 28 * 86400), until: String(now) },
    { metric: "reach", period: "days_28" },
  ];
  for (const params of attempts) {
    try {
      const res = await getJSON<{ data: IgInsight[] }>(graphUrl(base, `${account}/insights`, params, token), {
        timeoutMs: 7000,
        revalidate: 900,
      });
      const m = res.data?.[0];
      const total = m?.total_value?.value;
      if (typeof total === "number") return total;
      const last = m?.values?.[m.values.length - 1]?.value;
      if (typeof last === "number") return last;
    } catch {
      /* next shape */
    }
  }
  return undefined;
}

/** Daily follower deltas for the last 30 days (API max), oldest → newest. */
async function followerDeltas(base: string, account: string, token: string): Promise<{ date: string; value: number }[]> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const res = await getJSON<{ data: IgInsight[] }>(
      graphUrl(base, `${account}/insights`, {
        metric: "follower_count",
        period: "day",
        since: String(now - 29 * 86400),
        until: String(now),
      }, token),
      { timeoutMs: 7000, revalidate: 900 },
    );
    const values = res.data?.[0]?.values ?? [];
    return values
      .filter((v): v is { value: number; end_time: string } => typeof v.value === "number" && !!v.end_time)
      // end_time marks the END of the day bucket; the day it describes is the one before.
      .map((v) => ({ date: isoDay(new Date(new Date(v.end_time).getTime() - 1)), value: v.value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/* ─────────────────────────── fetcher ─────────────────────────── */

export async function fetchInstagram(_req: Request): Promise<ModulePayload<InstagramDetail>> {
  const token = process.env.INSTAGRAM_TOKEN?.trim();
  if (!token) {
    return emptyPayload(
      "instagram",
      "unconfigured",
      SOURCE,
      "Set INSTAGRAM_TOKEN in .env.local to a long-lived Instagram token (Meta for Developers → your app → Instagram → API setup with Instagram login → Generate token; it starts with IGAA).",
    ) as ModulePayload<InstagramDetail>;
  }

  const apiPath = detectInstagramToken(token);
  if (!apiPath) {
    return emptyPayload(
      "instagram",
      "unconfigured",
      SOURCE,
      "INSTAGRAM_TOKEN doesn't look like an Instagram token. Use an Instagram Login token (starts with IGAA) or a Facebook Login user token (starts with EAA) in .env.local.",
    ) as ModulePayload<InstagramDetail>;
  }

  let account: string;
  if (apiPath.account) {
    account = apiPath.account;
  } else {
    const id = process.env.INSTAGRAM_BUSINESS_ID?.trim();
    if (!id) {
      return emptyPayload(
        "instagram",
        "unconfigured",
        SOURCE,
        `Your EAA token uses Facebook Login, which needs INSTAGRAM_BUSINESS_ID. Find it with GET https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=instagram_business_account{id,username}&access_token=<your token> and put instagram_business_account.id into INSTAGRAM_BUSINESS_ID in .env.local.`,
      ) as ModulePayload<InstagramDetail>;
    }
    account = id;
  }

  const source = `${SOURCE} · ${apiPath.path === "instagram-login" ? "Instagram Login" : "Facebook Login"}`;

  try {
    const profileFields =
      apiPath.path === "instagram-login"
        ? "user_id,username,followers_count,follows_count,media_count,profile_picture_url"
        : "id,username,followers_count,follows_count,media_count,profile_picture_url";

    const [profile, mediaRes, deltas, reach28d] = await Promise.all([
      getJSON<IgProfile>(graphUrl(apiPath.base, account, { fields: profileFields }, token), { timeoutMs: 8000, revalidate: 300 }),
      getJSON<{ data: IgMediaRaw[] }>(
        graphUrl(apiPath.base, `${account}/media`, {
          fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
          limit: "24",
        }, token),
        { timeoutMs: 8000, revalidate: 300 },
      ),
      followerDeltas(apiPath.base, account, token),
      accountReach(apiPath.base, account, token),
    ]);

    const raw = mediaRes.data ?? [];
    // Insights for the 12 most recent posts; each failure is tolerated individually.
    const insights = await Promise.all(raw.slice(0, 12).map((m) => mediaInsights(apiPath.base, m.id, token)));

    const media: InstagramMedia[] = raw.map((m, i) => ({
      id: m.id,
      caption: m.caption ?? "",
      mediaType: m.media_type,
      productType: m.media_product_type,
      permalink: m.permalink,
      thumbnail: m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
      timestamp: m.timestamp,
      likes: m.like_count,
      comments: m.comments_count,
      reach: insights[i]?.reach,
      plays: insights[i]?.plays,
    }));

    const followers = profile.followers_count ?? 0;
    const followerHistory = backAccumulate(followers, deltas);
    const growth30d = deltas.reduce((s, d) => s + d.value, 0);

    const recent = media.slice(0, 12).filter((m) => m.likes !== undefined || m.comments !== undefined);
    const engagementRate =
      followers > 0 && recent.length > 0
        ? recent.reduce((s, m) => s + ((m.likes ?? 0) + (m.comments ?? 0)) / followers, 0) / recent.length
        : undefined;
    const reels = media.filter((m) => m.productType === "REELS").length;

    const username = profile.username;
    const detail: InstagramDetail = {
      username,
      profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`,
      apiPath: apiPath.path,
      followers,
      follows: profile.follows_count,
      mediaCount: profile.media_count ?? media.length,
      followerHistory,
      reach28d,
      engagementRate,
      media,
    };

    const metrics: Metric[] = [
      { label: "Reach 28d", value: reach28d !== undefined ? compact(reach28d) : "n/a" },
      { label: "Engagement", value: engagementRate !== undefined ? `${(engagementRate * 100).toFixed(2)}%` : "n/a" },
      { label: `Reels (last ${media.length})`, value: String(reels) },
      {
        label: "Growth 30d",
        value: deltas.length ? `${growth30d >= 0 ? "+" : ""}${compact(growth30d)}` : "n/a",
        delta: deltas.length ? growth30d : undefined,
      },
      { label: "Posts", value: compact(detail.mediaCount) },
      { label: "Following", value: profile.follows_count !== undefined ? compact(profile.follows_count) : "n/a" },
    ];

    let summary: string;
    if (deltas.length >= 2) {
      const days = deltas.length;
      const half = Math.floor(days / 2);
      const firstHalf = deltas.slice(0, half).reduce((s, d) => s + d.value, 0);
      const secondHalf = deltas.slice(half).reduce((s, d) => s + d.value, 0);
      const trend =
        growth30d === 0 ? "flat" : secondHalf > firstHalf ? "accelerating" : secondHalf < firstHalf ? "slowing" : "steady";
      summary = `@${username} has ${followers.toLocaleString("en-US")} followers, ${growth30d >= 0 ? "up" : "down"} ${Math.abs(growth30d).toLocaleString("en-US")} over the last ${days} days (${trend}).`;
    } else {
      summary = `@${username} has ${followers.toLocaleString("en-US")} followers across ${detail.mediaCount} posts; follower history insights are unavailable for this account.`;
    }
    if (engagementRate !== undefined) summary += ` Recent posts engage ${(engagementRate * 100).toFixed(2)}% of followers.`;

    return {
      id: "instagram",
      status: "live",
      fetchedAt: Date.now(),
      source,
      headline: { label: "Followers", value: compact(followers), delta: deltas.length ? growth30d : undefined },
      metrics,
      series: followerHistory.map((p) => p.total),
      summary,
      detail,
    };
  } catch (e) {
    return emptyPayload("instagram", "error", source, hintFor(e, apiPath)) as ModulePayload<InstagramDetail>;
  }
}
