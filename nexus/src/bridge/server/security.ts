/**
 * Request guard for every /api/bridge route.
 *
 * Threat model: the bridge drives the user's real Mac, and it listens on a
 * dev server. "Bound to localhost" is NOT enough — any web page the user
 * visits can fire requests at http://localhost:3000 from their browser, and
 * DNS rebinding can make a hostile domain resolve to 127.0.0.1. So:
 *   1. Off by default (NEXUS_BRIDGE=1 opts in).
 *   2. macOS only.
 *   3. Host header must be a loopback name — defeats DNS rebinding, where the
 *      Host would be the attacker's domain.
 *   4. Origin (when sent) must be exactly this host, and Sec-Fetch-Site (when
 *      sent) must be same-origin/none — defeats cross-site fetches.
 *   5. POST bodies must be application/json. A cross-site <form> or "simple"
 *      fetch can only send text/plain / form encodings without a CORS
 *      preflight, and we never answer preflights, so CSRF can't reach us.
 */

export interface GuardEnv {
  /** Defaults to process.platform — overridable so tests run on Linux. */
  platform?: string;
  /** Defaults to process.env.NEXUS_BRIDGE. */
  flag?: string | undefined;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** "localhost:3000" → "localhost", "[::1]:3000" → "[::1]". */
export function hostName(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? h : h.slice(0, end + 1);
  }
  return h.split(":")[0];
}

/**
 * Loopback + same-origin checks only. Used on its own by /status so the UI
 * can learn *why* the bridge is off.
 */
export function guardOrigin(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  if (!host || !LOOPBACK.has(hostName(host))) {
    return json(403, { ok: false, message: "The desktop bridge only answers on localhost." });
  }
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== `http://${host}` && origin !== `https://${host}`) {
    return json(403, { ok: false, message: "Cross-origin requests to the desktop bridge are refused." });
  }
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return json(403, { ok: false, message: "Cross-site requests to the desktop bridge are refused." });
  }
  if (req.method === "POST") {
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      return json(415, { ok: false, message: "The desktop bridge only accepts JSON." });
    }
  }
  return null;
}

export interface BridgeStatus {
  enabled: boolean;
  platform: string;
  /** Why it's off, phrased for the UI; null when enabled. */
  reason: string | null;
  fix?: string;
}

export function bridgeStatus(env: GuardEnv = {}): BridgeStatus {
  const platform = env.platform ?? process.platform;
  const flag = "flag" in env ? env.flag : process.env.NEXUS_BRIDGE;
  if (flag !== "1") {
    return { enabled: false, platform, reason: "Desktop bridge is off", fix: "Set NEXUS_BRIDGE=1 in .env.local and restart the dev server." };
  }
  if (platform !== "darwin") {
    return { enabled: false, platform, reason: "The desktop bridge only works on macOS", fix: `This server is running on ${platform}.` };
  }
  return { enabled: true, platform, reason: null };
}

/** Full guard for action routes. Returns a Response to send, or null to proceed. */
export function guard(req: Request, env: GuardEnv = {}): Response | null {
  const flag = "flag" in env ? env.flag : process.env.NEXUS_BRIDGE;
  if (flag !== "1") {
    return json(404, { ok: false, message: "Desktop bridge is off", fix: "Set NEXUS_BRIDGE=1 in .env.local and restart the dev server." });
  }
  const status = bridgeStatus({ ...env, flag });
  if (!status.enabled) return json(501, { ok: false, message: status.reason, fix: status.fix });
  return guardOrigin(req);
}
