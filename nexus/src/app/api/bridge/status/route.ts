import { bridgeStatus, guardOrigin } from "@/bridge/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET → { enabled, platform, reason, fix? }. Answers 200 even when the bridge
 * is off so the UI can explain why — but still only to same-origin loopback
 * callers, since even "is it on" is not for other sites.
 */
export async function GET(req: Request) {
  const blocked = guardOrigin(req);
  if (blocked) return blocked;
  return Response.json(bridgeStatus(), { headers: { "cache-control": "no-store" } });
}
