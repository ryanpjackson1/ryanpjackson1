/**
 * Browser-side bridge client. Never throws: every failure (network, HTTP,
 * bad JSON) comes back as a BridgeResult with a spoken message and a fix.
 */
import type { BridgeArgs, BridgeResult, BridgeVerb, InstalledApp } from "./verbs";

export interface BridgeStatusResponse {
  enabled: boolean;
  platform: string;
  reason: string | null;
  fix?: string;
}

const DEV_SERVER_FIX = "Make sure the NEXUS dev server is running (npm run dev) and reload the page.";

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function callBridge<V extends BridgeVerb>(verb: V, args: BridgeArgs[V]): Promise<BridgeResult> {
  let res: Response;
  try {
    res = await fetch("/api/bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verb, args }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "I couldn't reach the desktop bridge.", fix: DEV_SERVER_FIX };
  }
  const body = await readJson(res);
  if (body && typeof body.message === "string") {
    return {
      ok: res.ok && body.ok === true,
      message: body.message,
      fix: typeof body.fix === "string" ? body.fix : undefined,
      data: body.data,
    };
  }
  if (res.status === 404) {
    return { ok: false, message: "Desktop bridge is off", fix: "Set NEXUS_BRIDGE=1 in .env.local and restart the dev server." };
  }
  return { ok: false, message: `The desktop bridge answered with an error (${res.status}).`, fix: DEV_SERVER_FIX };
}

export async function fetchApps(): Promise<InstalledApp[]> {
  try {
    const res = await fetch("/api/bridge/apps", { cache: "no-store" });
    if (!res.ok) return [];
    const body = await readJson(res);
    return Array.isArray(body?.apps) ? (body.apps as InstalledApp[]) : [];
  } catch {
    return [];
  }
}

export async function fetchBridgeStatus(): Promise<BridgeStatusResponse> {
  try {
    const res = await fetch("/api/bridge/status", { cache: "no-store" });
    const body = await readJson(res);
    if (res.ok && body && typeof body.enabled === "boolean") return body as unknown as BridgeStatusResponse;
    return { enabled: false, platform: "unknown", reason: typeof body?.message === "string" ? body.message : `Bridge status unavailable (${res.status})` };
  } catch {
    return { enabled: false, platform: "unknown", reason: "Can't reach the dev server", fix: DEV_SERVER_FIX };
  }
}
