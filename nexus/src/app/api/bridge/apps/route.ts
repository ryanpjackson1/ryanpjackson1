import { guard } from "@/bridge/server/security";
import { listApps } from "@/bridge/server/apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { ok, apps: InstalledApp[] } from a live (30s-cached) scan. */
export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    return Response.json({ ok: true, apps: await listApps() }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return Response.json({ ok: false, message: "Couldn't read your Applications folders.", fix: String((err as Error)?.message ?? err) }, { status: 500 });
  }
}
