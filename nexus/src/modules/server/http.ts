/**
 * Server-side HTTP helpers for module fetchers.
 *
 * Every upstream call goes through here so that timeouts, caching hints and
 * error messages are consistent. Errors are `UpstreamError`s whose message is
 * already human-readable ("api.github.com responded 403 Forbidden: API rate
 * limit exceeded…") and never contain secrets (access tokens are redacted).
 */

/** Browser-like UA for hosts that reject unknown clients (Yahoo Finance). */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** Honest UA for hosts whose policy asks for identification (Nominatim). */
export const NEXUS_UA = "NEXUS/0.7 (personal dashboard; https://github.com)";

export interface GetOptions {
  /** Abort after this many ms (default 8000). */
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Next.js data-cache lifetime in seconds. Omit (or pass 0) for `no-store`. */
  revalidate?: number;
}

export class UpstreamError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  readonly host: string;
  constructor(message: string, host: string, status?: number, body?: unknown) {
    super(message);
    this.name = "UpstreamError";
    this.host = host;
    this.status = status;
    this.body = body;
  }
}

/** Strip credentials from a URL before it can land in a message or log. */
export function redactUrl(url: string): string {
  return url.replace(/(access_token|token|key|apikey|api_key)=[^&]+/gi, "$1=…");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Pull a readable message out of a JSON error body from common API shapes. */
function bodyMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 200) : undefined;
  const b = body as Record<string, unknown>;
  const err = b.error as Record<string, unknown> | string | undefined;
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string") return err.message;
  if (typeof b.message === "string") return b.message;
  const chart = b.chart as { error?: { description?: string } } | undefined;
  if (chart?.error?.description) return chart.error.description;
  return undefined;
}

type FetchInit = RequestInit & { next?: { revalidate?: number | false } };

async function request(url: string, opts: GetOptions, accept: string): Promise<Response> {
  const { timeoutMs = 8000, headers = {}, revalidate } = opts;
  const host = hostOf(url);
  const init: FetchInit = {
    headers: { accept, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (revalidate && revalidate > 0) init.next = { revalidate };
  else init.cache = "no-store";

  try {
    return await fetch(url, init);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new UpstreamError(`${host} timed out after ${Math.round(timeoutMs / 100) / 10}s`, host);
    }
    const code = err.cause?.code ? ` (${err.cause.code})` : "";
    throw new UpstreamError(`Could not reach ${host}${code} — check the network connection`, host);
  }
}

async function failure(res: Response, url: string): Promise<never> {
  const host = hostOf(url);
  let body: unknown;
  const text = await res.text().catch(() => "");
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const detail = bodyMessage(body);
  throw new UpstreamError(
    `${host} responded ${res.status}${res.statusText ? ` ${res.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    host,
    res.status,
    body,
  );
}

/** GET a JSON document. Throws UpstreamError with a readable message. */
export async function getJSON<T = unknown>(url: string, opts: GetOptions = {}): Promise<T> {
  const res = await request(url, opts, "application/json");
  if (!res.ok) await failure(res, url);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`${hostOf(url)} returned something that is not JSON`, hostOf(url), res.status);
  }
}

/** GET a text document (iCal, RSS). Throws UpstreamError with a readable message. */
export async function getText(url: string, opts: GetOptions = {}): Promise<string> {
  const res = await request(url, opts, "text/calendar, application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain, */*");
  if (!res.ok) await failure(res, url);
  return res.text();
}

/** Readable message from anything thrown. */
/** Readable message from anything thrown, without trailing punctuation (callers add ". <fix>"). */
export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/[\s.]+$/, "");
}

/** "2h 05m", "12m", "now" — compact relative duration for headlines. */
export function formatUntil(ms: number): string {
  if (ms <= 30_000) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return `in ${h}h ${String(m).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

/** Compact number for headlines: 1234 → "1,234", 12345 → "12.3K". */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** Truncate with an ellipsis on a word boundary when possible. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
